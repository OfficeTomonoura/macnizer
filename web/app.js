document.addEventListener('DOMContentLoaded', () => {
    // UI要素の取得
    const dropZone = document.getElementById('drop-zone');
    const folderInput = document.getElementById('folder-input');
    const selectedFilesSummary = document.getElementById('selected-files-summary');
    const selectedFilesCount = document.getElementById('selected-files-count');
    const backupToggle = document.getElementById('backup-toggle');
    const wordFixToggle = document.getElementById('word-fix-toggle');
    const fixedLayoutToggle = document.getElementById('fixed-layout-toggle');
    const centerContentToggle = document.getElementById('center-content-toggle');

    const form = document.getElementById('converter-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnSpinner = document.getElementById('btn-spinner');
    
    const resultsPanel = document.getElementById('results-panel');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const progressPercent = document.getElementById('progress-percent');
    
    const countSuccess = document.getElementById('count-success');
    const countSkip = document.getElementById('count-skip');
    const countError = document.getElementById('count-error');
    
    const consoleOutput = document.getElementById('console-output');
    const clearConsoleBtn = document.getElementById('clear-console-btn');

    // 状態管理
    let localFilesList = []; // 読み込んだ全ファイル（HTML以外も含む）

    // --- 共通UIユーティリティ ---
    function appendLog(text, type = 'info') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        line.innerText = `[${timeStr}] ${text}`;
        consoleOutput.appendChild(line);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }

    clearConsoleBtn.addEventListener('click', () => {
        consoleOutput.innerHTML = '';
        appendLog('コンソールがクリアされました', 'system');
    });

    function updateProgress(percent, text) {
        progressFill.style.width = `${percent}%`;
        progressText.innerText = text;
        progressPercent.innerText = `${percent}%`;
    }

    function updateCounts(type, count) {
        if (type === 'success') countSuccess.innerText = count;
        if (type === 'skip') countSkip.innerText = count;
        if (type === 'error') countError.innerText = count;
    }

    function updateSubmitButtonState() {
        if (localFilesList.length > 0) {
            const htmlCount = localFilesList.filter(f => {
                const ext = f.name.split('.').pop().toLowerCase();
                return ext === 'html' || ext === 'htm';
            }).length;
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').innerText = `変換してZIPダウンロード (HTML: ${htmlCount}個 / 総ファイル: ${localFilesList.length}個)`;
        } else {
            submitBtn.disabled = true;
            submitBtn.querySelector('.btn-text').innerText = '変換してZIPダウンロード';
        }
    }

    // --- ドラッグ＆ドロップ ＆ フォルダ選択ロジック ---
    
    // ドラッグ＆ドロップのビジュアル効果
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    // ディレクトリのエントリを再帰的に読み込むためのヘルパー
    function readAllEntries(dirReader) {
        const entries = [];
        return new Promise((resolve) => {
            const read = () => {
                dirReader.readEntries((results) => {
                    if (results.length === 0) {
                        resolve(entries);
                    } else {
                        entries.push(...results);
                        read();
                    }
                }, (err) => {
                    console.error("Read entries error", err);
                    resolve(entries);
                });
            };
            read();
        });
    }

    // エントリを解析して全ファイルを抽出
    async function getFilesFromEntry(entry) {
        const files = [];
        if (entry.isFile) {
            // ~一時ファイルやシステムファイル (.DS_Store / Thumbs.db) は除外
            if (entry.name.startsWith('~') || entry.name === '.DS_Store' || entry.name === 'Thumbs.db') {
                return files;
            }
            const file = await new Promise((resolve) => entry.file(resolve));
            // ファイルの相対パスを設定 (先頭のスラッシュを削除)
            file.relativePath = entry.fullPath.startsWith('/') ? entry.fullPath.substring(1) : entry.fullPath;
            files.push(file);
        } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const entries = await readAllEntries(dirReader);
            for (const childEntry of entries) {
                const childFiles = await getFilesFromEntry(childEntry);
                files.push(...childFiles);
            }
        }
        return files;
    }

    // ファイルドロップ時の処理
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        const items = e.dataTransfer.items;
        if (!items) return;

        appendLog('ドロップされた要素をスキャンしています...', 'info');
        localFilesList = [];

        const scanPromises = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry();
                if (entry) {
                    scanPromises.push(getFilesFromEntry(entry));
                }
            }
        }

        const results = await Promise.all(scanPromises);
        results.forEach(fileList => {
            localFilesList.push(...fileList);
        });

        handleFilesSelected();
    });

    // フォルダ選択ボタンでの処理
    folderInput.addEventListener('change', () => {
        const files = folderInput.files;
        localFilesList = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // ~一時ファイルやシステムファイル (.DS_Store / Thumbs.db) は除外
            if (file.name.startsWith('~') || file.name === '.DS_Store' || file.name === 'Thumbs.db') {
                continue;
            }
            file.relativePath = file.webkitRelativePath;
            localFilesList.push(file);
        }

        handleFilesSelected();
    });

    function handleFilesSelected() {
        if (localFilesList.length > 0) {
            const htmlCount = localFilesList.filter(f => {
                const ext = f.name.split('.').pop().toLowerCase();
                return ext === 'html' || ext === 'htm';
            }).length;

            selectedFilesSummary.classList.remove('hidden');
            selectedFilesCount.innerText = `${localFilesList.length} (うちHTML: ${htmlCount})`;
            appendLog(`ファイルを検出しました。 (総ファイル数: ${localFilesList.length}個、HTMLファイル: ${htmlCount}個)`, 'success');
        } else {
            selectedFilesSummary.classList.add('hidden');
            appendLog('対象となるファイルが見つかりませんでした。', 'skip');
        }
        updateSubmitButtonState();
    }

    // --- 文字コード置換コアロジック ---
    const RE_CHARSET_HTML5 = /(<meta\s+charset\s*=\s*['"]?)(shift[-_]?jis|sjis|x-sjis|cp932|ms_kanji)(['"]?\s*\/?>)/i;
    const RE_CHARSET_HTML4 = /(content\s*=\s*['"][^'"]*charset\s*=\s*)(shift[-_]?jis|sjis|x-sjis|cp932|ms_kanji)(['"]?[^>]*>)/i;
    const RE_CHARSET_XML = /(<\?xml\s+[^>]*encoding\s*=\s*['"]?)(shift[-_]?jis|sjis|x-sjis|cp932|ms_kanji)(['"]?[^>]*\?>)/i;

    // --- Word文書プロパティ（Author / Company）の書き換え ---
    const NEW_DOC_AUTHOR = '德永塁';
    const NEW_DOC_COMPANY = '合同会社Office鞆の浦';
    const RE_O_AUTHOR = /(<o:Author>)([\s\S]*?)(<\/o:Author>)/i;
    const RE_O_COMPANY = /(<o:Company>)([\s\S]*?)(<\/o:Company>)/i;

    function convertContent(content) {
        let modified = false;
        let propsModified = false;

        let newContent = content.replace(RE_CHARSET_HTML5, (match, p1, p2, p3) => {
            modified = true;
            return `${p1}utf-8${p3}`;
        });

        newContent = newContent.replace(RE_CHARSET_HTML4, (match, p1, p2, p3) => {
            modified = true;
            return `${p1}utf-8${p3}`;
        });

        newContent = newContent.replace(RE_CHARSET_XML, (match, p1, p2, p3) => {
            modified = true;
            return `${p1}utf-8${p3}`;
        });

        newContent = newContent.replace(RE_O_AUTHOR, (match, p1, p2, p3) => {
            propsModified = true;
            return `${p1}${NEW_DOC_AUTHOR}${p3}`;
        });

        newContent = newContent.replace(RE_O_COMPANY, (match, p1, p2, p3) => {
            propsModified = true;
            return `${p1}${NEW_DOC_COMPANY}${p3}`;
        });

        return { content: newContent, modified, propsModified };
    }

    // --- Word HTMLレイアウト修正ロジック ---
    // fixedLayout: true の場合、ウィンドウ幅に応じたレスポンシブ化を行わず、
    //              Word指定の固定幅を常に維持する（狭い画面では横スクロールになる）
    // centerContent: true の場合、本文（WordSectionのdiv）をウィンドウ中央に配置する
    function fixWordHtmlLayout(content, fixedLayout = false, centerContent = false) {
        let clean = content;

        // 1. <table> タグ内の align=left または align=right 属性を除去
        clean = clean.replace(/(<table[^>]*?)\balign=['"]?(left|right)['"]?/gi, '$1');

        // 2. テーブル間の不要な空の段落タグを削除 (o:p &nbsp; もしくは空文字列などを含むpタグ)
        const emptyParagraphRegex = /<p[^>]*?>\s*<span[^>]*?font-size:\s*1\.0pt[^>]*?>.*?<\/span>\s*<\/p>/gi;
        clean = clean.replace(emptyParagraphRegex, '');

        // 2b. 中身が <o:p>&nbsp;</o:p> のみの空段落（Word側で意図されていない行送り用の空行）を
        //     spanのfont-sizeに関わらず丸ごと削除する（margin:0だけでは行の高さ分の余白が残るため）
        const nbspOnlyParagraphRegex = /<p[^>]*?>\s*(?:<span[^>]*?>\s*)*<o:p>&nbsp;<\/o:p>\s*(?:<\/span>\s*)*<\/p>/gi;
        clean = clean.replace(nbspOnlyParagraphRegex, '');

        // 3. ビューポートメタタグの追加（head内になければ追加）
        if (!/<meta[^>]*?name=['"]?viewport['"]?/i.test(clean)) {
            clean = clean.replace(/(<head[^>]*?>)/i, `$1\n <meta name="viewport" content="width=device-width, initial-scale=1.0">`);
        }

        // 4. 過去バージョンのmacnizerが挿入した<style>ブロックを除去
        //    （旧バージョンのレスポンシブ化メディアクエリ等が再変換後も残り続けるのを防ぐ）
        clean = clean.replace(/\n?<style>\s*\/\*\s*macnizer[\s\S]*?<\/style>\n?/gi, '\n');

        // 5. 回り込み解除CSSの追加（</head>の直前）
        //    fixedLayout=false（デフォルト）: 従来通り狭い画面でテーブルを100%幅・自動レイアウトに変える
        //    fixedLayout=true: レスポンシブ化を行わず、Word指定の固定幅を常に維持し、
        //                      画面が狭い場合はブラウザの横スクロールに委ねる。
        const responsiveBlock = `
 @media screen and (max-width: 768px) {
   table.MsoNormalTable, table[class*="Mso"] {
     width: 100% !important;
     max-width: 100% !important;
     table-layout: auto !important;
     float: none !important;
     clear: both !important;
   }
   td {
     width: auto !important;
     white-space: normal !important;
   }
 }`;
        // centerContent=true: 本文（div.WordSectionN）を内容幅にfitさせた上で
        //                     margin:auto で画面中央に配置する。
        //                     さらに余白（body）と本文（div）を明暗で分け、
        //                     本文が「用紙」のように浮いて見えるようにする
        const centerBlock = `
 body {
   background: #191970 !important;
 }
 div[class^="WordSection"] {
   max-width: fit-content;
   margin-left: auto !important;
   margin-right: auto !important;
   background: #ffffff;
   box-shadow: 0 0 12px rgba(0,0,0,0.25);
   padding: 32px;
   box-sizing: content-box;
 }`;
        const customStyle = `
<style>
 /* macnizer 回り込み解除の修正 */${fixedLayout ? '' : responsiveBlock}${centerContent ? centerBlock : ''}
 table {
   float: none !important;
   clear: both !important;
 }
 /* class無し<p>はmso-margin-top/bottom-altがブラウザに無視され既定の上下マージンが入るため除去 */
 p:not([class]) {
   margin-top: 0;
   margin-bottom: 0;
 }
</style>
`;
        clean = clean.replace(/(<\/head>)/i, `${customStyle}\n$1`);

        return clean;
    }

    function processFileContent(arrayBuffer, fixWordLayout = false, fixedLayout = false, centerContent = false) {
        const uint8Array = new Uint8Array(arrayBuffer);
        
        let decodedText = null;
        let detectedEncoding = null;
        
        // 1. UTF-8でデコードを試みる
        try {
            const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
            decodedText = utf8Decoder.decode(uint8Array);
            detectedEncoding = 'utf-8';
        } catch (e) {
            // UTF-8ではない
        }
        
        // 2. CP932 / Shift-JISでデコードを試みる
        if (decodedText === null) {
            try {
                const sjisDecoder = new TextDecoder('shift-jis', { fatal: true });
                decodedText = sjisDecoder.decode(uint8Array);
                detectedEncoding = 'shift-jis';
            } catch (e) {
                // デコード不能
            }
        }
        
        if (decodedText === null) {
            return { success: false, status: 'error', message: '文字コードを判定できませんでした (UTF-8 / Shift-JIS ではありません)' };
        }
        
        // 文字コード記述の置換 / 文書プロパティ（Author・Company）の書き換え
        let { content: newText, modified: descModified, propsModified } = convertContent(decodedText);

        let wordFixed = false;
        if (fixWordLayout) {
            const originalText = newText;
            newText = fixWordHtmlLayout(newText, fixedLayout, centerContent);
            if (newText !== originalText) {
                wordFixed = true;
            }
        }

        const encodingNeedsChange = (detectedEncoding === 'shift-jis');

        if (!encodingNeedsChange && !descModified && !propsModified && !wordFixed) {
            return { success: true, status: 'skip', message: 'すでにUTF-8（変換不要）', originalText: decodedText };
        }

        const messageParts = [];
        if (encodingNeedsChange) messageParts.push('エンコード変換 (Shift-JIS -> UTF-8)');
        if (descModified) messageParts.push('文字コードタグ書換 (utf-8)');
        if (propsModified) messageParts.push('文書プロパティ書換 (Author/Company)');
        if (wordFixed) messageParts.push('Wordレイアウト修正');

        return {
            success: true,
            status: 'success',
            message: messageParts.join(' & '),
            convertedText: newText,
            originalText: decodedText
        };
    }

    // --- 変換実行アクション ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (localFilesList.length === 0) return;

        // UI初期化
        submitBtn.disabled = true;
        btnSpinner.style.display = 'block';
        resultsPanel.classList.remove('hidden');
        progressContainer.classList.remove('hidden');
        progressFill.style.background = 'var(--primary-gradient)';
        
        countSuccess.innerText = '0';
        countSkip.innerText = '0';
        countError.innerText = '0';
        consoleOutput.innerHTML = '';

        const makeBackup = backupToggle.checked;
        const fixWordLayout = wordFixToggle.checked;
        const fixedLayout = fixedLayoutToggle.checked;
        const centerContent = centerContentToggle.checked;
        appendLog(`一括変換処理を開始します... (対象ファイル: ${localFilesList.length}個)`, 'system');
        updateProgress(5, 'ZIPアーカイブの準備中...');

        try {
            const zip = new JSZip();
            let successCount = 0;
            let skipCount = 0;
            let errorCount = 0;

            for (let i = 0; i < localFilesList.length; i++) {
                const file = localFilesList[i];
                const progressVal = 10 + Math.floor((i / localFilesList.length) * 70);
                
                const relPath = file.relativePath || file.name;
                updateProgress(progressVal, `ファイルを処理中 (${i + 1}/${localFilesList.length}): ${relPath}`);

                const ext = file.name.split('.').pop().toLowerCase();
                const isHtml = (ext === 'html' || ext === 'htm');

                try {
                    const arrayBuffer = await file.arrayBuffer();

                    if (isHtml) {
                        // HTMLファイルの場合は文字コード変換およびWordレイアウト修正を実行
                        const result = processFileContent(arrayBuffer, fixWordLayout, fixedLayout, centerContent);

                        if (result.success) {
                            if (result.status === 'success') {
                                successCount++;
                                updateCounts('success', successCount);
                                appendLog(`[HTML変換] ${relPath} (${result.message})`, 'success');
                                
                                // 変換後のテキストをUTF-8で追加
                                zip.file(relPath, result.convertedText);

                                // バックアップを作成する場合、元データを.bakで同梱
                                if (makeBackup) {
                                    zip.file(relPath + '.bak', new Uint8Array(arrayBuffer));
                                }
                            } else {
                                skipCount++;
                                updateCounts('skip', skipCount);
                                appendLog(`[HTMLスキップ] ${relPath} (${result.message})`, 'skip');
                                
                                // 変換不要な場合も元のテキストをそのまま格納
                                zip.file(relPath, result.originalText);
                            }
                        } else {
                            errorCount++;
                            updateCounts('error', errorCount);
                            appendLog(`[HTMLエラー] ${relPath} (理由: ${result.message})`, 'error');
                            
                            // エラー時も元のバイナリをそのまま入れる
                            zip.file(relPath, new Uint8Array(arrayBuffer));
                        }
                    } else {
                        // HTML以外（画像、CSS、JS、その他）はバイナリのまま無変換でZIPに追加
                        zip.file(relPath, new Uint8Array(arrayBuffer));
                    }
                } catch (e) {
                    errorCount++;
                    updateCounts('error', errorCount);
                    appendLog(`[エラー] ${relPath} (読み込み/処理失敗: ${e.message})`, 'error');
                    zip.file(relPath, file);
                }

                // UIのレンダリングをスムーズにするためのウェイト
                if (i % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }

            updateProgress(85, 'ZIPアーカイブをビルド中...');
            appendLog('ZIPファイルを生成・圧縮しています...', 'info');

            const content = await zip.generateAsync({ type: 'blob' });

            updateProgress(95, 'ダウンロード用データを構築中...');
            
            // 自動ダウンロード
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `macnizer_converted_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            updateProgress(100, '変換完了');
            appendLog('----------------------------------------', 'info');
            appendLog(`全ての処理が完了しました！ (変換完了: ${successCount}, スキップ: ${skipCount}, エラー: ${errorCount})`, 'system');
            appendLog('フォルダ構造とその他ファイルを完全に維持したZIPアーカイブがダウンロードされました。', 'system');

        } catch (e) {
            console.error(e);
            appendLog(`致命的なエラーが発生しました: ${e.message}`, 'error');
            updateProgress(100, 'エラー中断');
            progressFill.style.background = 'var(--error-color)';
        } finally {
            submitBtn.disabled = false;
            btnSpinner.style.display = 'none';
            updateSubmitButtonState();
        }
    });
});
