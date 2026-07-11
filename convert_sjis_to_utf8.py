#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import argparse
import shutil
import sys

# 正規表現パターン (Shift-JIS系の表記揺れに対応)
RE_CHARSET_HTML5 = re.compile(
    r'(<meta\s+charset\s*=\s*[\'"]?)(shift[-_]?jis|sjis|x-sjis|cp932|ms_kanji)([\'"]?\s*/?>)',
    re.IGNORECASE
)

RE_CHARSET_HTML4 = re.compile(
    r'(content\s*=\s*[\'"][^\'"]*charset\s*=\s*)(shift[-_]?jis|sjis|x-sjis|cp932|ms_kanji)([\'"]?[^>]*>)',
    re.IGNORECASE
)

RE_CHARSET_XML = re.compile(
    r'(<\?xml\s+[^>]*encoding\s*=\s*[\'"]?)(shift[-_]?jis|sjis|x-sjis|cp932|ms_kanji)([\'"]?[^>]*\?>)',
    re.IGNORECASE
)

def convert_content(content):
    """
    HTML/XMLコンテンツ内の文字コード指定記述を Shift-JIS から utf-8 に置換する
    """
    modified = False
    
    # HTML5 charset 置換
    new_content, count = RE_CHARSET_HTML5.subn(r'\1utf-8\3', content)
    if count > 0:
        modified = True
        content = new_content
        
    # HTML4 charset 置換
    new_content, count = RE_CHARSET_HTML4.subn(r'\1utf-8\3', content)
    if count > 0:
        modified = True
        content = new_content

    # XML encoding 置換
    new_content, count = RE_CHARSET_XML.subn(r'\1utf-8\3', content)
    if count > 0:
        modified = True
        content = new_content
        
    return content, modified

def process_file(file_path, make_backup=True):
    """
    単一のファイルを処理する。
    """
    try:
        # バイナリとして読み込み
        with open(file_path, 'rb') as f:
            raw_data = f.read()
    except Exception as e:
        print(f"[Error] ファイルの読み込みに失敗しました: {file_path} (理由: {e})", file=sys.stderr)
        return False, "Read Error"

    decoded_text = None
    detected_encoding = None
    
    # 1. UTF-8 でデコード試行
    try:
        decoded_text = raw_data.decode('utf-8')
        detected_encoding = 'utf-8'
    except UnicodeDecodeError:
        pass

    # 2. cp932 (Windows向け拡張Shift-JIS) でデコード試行
    if decoded_text is None:
        try:
            decoded_text = raw_data.decode('cp932')
            detected_encoding = 'cp932'
        except UnicodeDecodeError:
            pass

    # 3. 標準の shift_jis でデコード試行
    if decoded_text is None:
        try:
            decoded_text = raw_data.decode('shift_jis')
            detected_encoding = 'shift_jis'
        except UnicodeDecodeError:
            pass

    if decoded_text is None:
        print(f"[Skip] 文字コードを判定できませんでした (UTF-8 / Shift-JIS ではありません): {file_path}")
        return False, "Unknown Encoding"

    # 文字コード記述の置換
    new_text, desc_modified = convert_content(decoded_text)
    
    # 変換が必要かどうかの判断
    # 状況1: 元ファイルが Shift-JIS 系のエンコーディングである
    # 状況2: 元ファイルは UTF-8 だが、記述の中に Shift-JIS が残っている
    encoding_needs_change = (detected_encoding in ['cp932', 'shift_jis'])
    
    if not encoding_needs_change and not desc_modified:
        # すでに UTF-8 であり、記述の書き換えも不要な場合
        return True, "No Action Needed"

    # バックアップの作成
    backup_path = file_path + '.bak'
    if make_backup:
        try:
            shutil.copy2(file_path, backup_path)
        except Exception as e:
            print(f"[Error] バックアップの作成に失敗しました: {backup_path} (理由: {e})", file=sys.stderr)
            return False, "Backup Error"

    # 書き込み (UTF-8)
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_text)
    except Exception as e:
        print(f"[Error] ファイルの書き込みに失敗しました: {file_path} (理由: {e})", file=sys.stderr)
        # バックアップから復元を試みる
        if make_backup and os.path.exists(backup_path):
            try:
                shutil.copy2(backup_path, file_path)
                print(f"[Restore] バックアップから復元しました: {file_path}")
            except Exception as ree:
                print(f"[Critical] バックアップからの復元に失敗しました: {file_path} (理由: {ree})", file=sys.stderr)
        return False, "Write Error"

    # 処理結果のログ
    reasons = []
    if encoding_needs_change:
        reasons.append(f"エンコード変換 ({detected_encoding} -> utf-8)")
    if desc_modified:
        reasons.append("文字コード記述書き換え")
    
    action_str = " & ".join(reasons)
    print(f"[Success] 変換完了: {file_path} ({action_str})")
    return True, "Converted"

def main():
    parser = argparse.ArgumentParser(
        description='HTML/XMLファイルの文字コード表記（Shift-JIS系）をUTF-8に書き換え、ファイル自体もUTF-8に変換します。'
    )
    parser.add_argument('directory', help='処理対象のディレクトリパス')
    parser.add_argument('--no-backup', action='store_true', help='元ファイルのバックアップ（*.bak）を作成しません。')
    
    args = parser.parse_args()
    
    target_dir = os.path.abspath(args.directory)
    if not os.path.isdir(target_dir):
        print(f"[Error] 指定されたパスはディレクトリではありません: {target_dir}", file=sys.stderr)
        sys.exit(1)
        
    print(f"処理を開始します... 対象ディレクトリ: {target_dir}")
    print(f"バックアップ作成: {'無効' if args.no_backup else '有効'}")
    print("-" * 60)
    
    success_count = 0
    skip_count = 0
    error_count = 0
    
    for root, dirs, files in os.walk(target_dir):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in ['.htm', '.html']:
                file_path = os.path.join(root, file)
                success, status = process_file(file_path, make_backup=not args.no_backup)
                if success:
                    if status == "Converted":
                        success_count += 1
                    else:
                        skip_count += 1
                else:
                    error_count += 1
                    
    print("-" * 60)
    print("処理が終了しました。")
    print(f"  変換成功: {success_count} 件")
    print(f"  スキップ : {skip_count} 件")
    print(f"  エラー   : {error_count} 件")

if __name__ == '__main__':
    main()
