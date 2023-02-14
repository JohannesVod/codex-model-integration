const vscode = require("vscode");

function getNonce() {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

class SidebarProvider {
    
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
    }

    resolveWebviewView(webviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
        // Allow scripts in the webview
        enableScripts: true,



        localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
        switch (data.type) {
            case "onInfo": {
            if (!data.value) {
                return;
            }
            vscode.window.showInformationMessage(data.value);
            break;
            }
            case "onError": {
            if (!data.value) {
                return;
            }
            vscode.window.showErrorMessage(data.value);
            break;
            }
            case "command": {
                if (!data.command) {
                  return;
                }
                vscode.commands.executeCommand(data.command);
                break;
            }
        }
        });
    }

    revive(panel) {
        this._view = panel;
    }

    _getHtmlForWebview(webview) {
        const style = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media/vscode.css"));

        const nonce = getNonce();
        // Use a nonce to only allow a specific script to be run.
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <!-- Use a content security policy to only allow loading images from https or from our extension directory,
                 and only allow scripts that have a specific nonce. -->
            <meta http-equiv="Content-Security-Policy" content="img-src https: data:; style-src 'unsafe-inline' ${
        webview.cspSource
        }; script-src 'nonce-${nonce}';">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link rel="stylesheet" type="text/css" href="${style}">
        </head>
        <body>
            <h1>Codex</h1>
            <button id="writeTestFunctionBtn">Write Testfunction</button>
            <button id="chatbotAnsweringBtn">Chatbot answering</button>
            <button id="continueBtn">Continue writing</button>
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                const writeTestFunctionBtn = document.getElementById("writeTestFunctionBtn");
                writeTestFunctionBtn.addEventListener("click", () => {
                    vscode.postMessage({ type: "command", command: "extension.writeTestFunction" });
                });

                const chatbotAnsweringBtn = document.getElementById("chatbotAnsweringBtn");
                chatbotAnsweringBtn.addEventListener("click", () => {
                    vscode.postMessage({ type: "command", command: "extension.chatbotFunction" });
                });

                const continueBtn = document.getElementById("continueBtn");
                continueBtn.addEventListener("click", () => {
                    vscode.postMessage({ type: "command", command: "extension.continueFunction" });
                });
            </script>
        </body>
        </html>`;
    }
}


module.exports = { SidebarProvider };
