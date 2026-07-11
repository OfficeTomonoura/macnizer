#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import json
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, HTTPServer

# 変換ロジックを convert_sjis_to_utf8.py からインポート
# 同一ディレクトリ内からインポートできるようにパスを通す
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

try:
    import convert_sjis_to_utf8 as converter
except ImportError as e:
    print(f"Error: convert_sjis_to_utf8.py をインポートできませんでした: {e}", file=sys.stderr)
    sys.exit(1)

PORT = 8085
WEB_DIR = os.path.join(current_dir, 'web')

class GUIRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # 静的ファイルが置かれている /web ディレクトリを基準とする
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_POST(self):
        if self.path == '/api/convert':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                params = json.loads(post_data.decode('utf-8'))
                directory = params.get('directory')
                no_backup = params.get('no_backup', False)
                
                # ディレクトリの存在確認
                if not directory:
                    self.send_error_response(400, "ディレクトリパスが空です。")
                    return
                
                expanded_dir = os.path.expanduser(directory)
                if not os.path.isdir(expanded_dir):
                    self.send_error_response(400, f"指定されたパスは有効なディレクトリではありません: {directory}")
                    return
                
                # 変換処理の実行
                results = self.run_conversion(expanded_dir, no_backup)
                
                # 成功レスポンスを返却
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(results, ensure_ascii=False).encode('utf-8'))
                
            except json.JSONDecodeError:
                self.send_error_response(400, "JSONの解析に失敗しました。")
            except Exception as e:
                self.send_error_response(500, f"内部サーバーエラーが発生しました: {str(e)}")
        else:
            self.send_error_response(404, "Not Found")

    def send_error_response(self, status_code, message):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        response = {"error": message}
        self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

    def run_conversion(self, target_dir, no_backup):
        files_processed = []
        
        # ディレクトリを走査して変換
        for root, dirs, files in os.walk(target_dir):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in ['.htm', '.html']:
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, target_dir)
                    
                    try:
                        # 既存の python 変換ツールロジックを呼び出す
                        success, status = converter.process_file(file_path, make_backup=not no_backup)
                        
                        if success:
                            if status == "Converted":
                                files_processed.append({
                                    "path": rel_path,
                                    "status": "success",
                                    "message": "UTF-8へのエンコード変換および記述書き換え完了"
                                })
                            else:
                                files_processed.append({
                                    "path": rel_path,
                                    "status": "skip",
                                    "message": "すでにUTF-8（変換不要）"
                                })
                        else:
                            files_processed.append({
                                    "path": rel_path,
                                    "status": "error",
                                    "message": status
                                })
                    except Exception as e:
                        files_processed.append({
                            "path": rel_path,
                            "status": "error",
                            "message": f"システムエラー: {str(e)}"
                        })
                        
        return {"files": files_processed}

def run(server_class=HTTPServer, handler_class=GUIRequestHandler, port=PORT):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    
    url = f"http://localhost:{port}/"
    print(f"サーバーを起動しました: {url}")
    print("終了するには Ctrl+C を押してください。")
    
    # ブラウザを自動で開く
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"ブラウザの自動起動に失敗しました: {e}")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nサーバーを停止しています...")
        httpd.server_close()
        print("サーバーが停止しました。")

if __name__ == '__main__':
    run()
