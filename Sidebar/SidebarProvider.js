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
    
    constructor(extensionUri, context) {
        this._extensionUri = extensionUri;
        this._context = context;
        this.is_scraping = this._context.workspaceState.get("webviewState") || false;
        this.temperature = this._context.workspaceState.get("temperature") || 20;
        this.maxTokens = this._context.workspaceState.get("maxTokens") || 256;
    }

    resolveWebviewView(webviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(
            webviewView.webview
        );

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
            case "inputValue": {
                this.is_scraping = data.value;
                this._context.workspaceState.update("webviewState", data.value);
                break;
            }
            case "temperature": {
                this.temperature = data.value;
                this._context.workspaceState.update("temperature", data.value);
                break;
            }
            case "maxTokens": {
                this.maxTokens = data.value;
                this._context.workspaceState.update("maxTokens", data.value);
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

        let is_checked_str = '"" checked';
        if (!this.is_scraping)
        {
            is_checked_str = "";
        }
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
            <input type="checkbox" id="checkbox" class="checkbox" value=${is_checked_str}>Scrape from stack overflow?</input>
            <button id="writeTestFunctionBtn">Write Testfunction</button>
            <button id="chatbotAnsweringBtn">Chatbot answering</button>
            <button id="continueBtn">Continue writing</button>
            <label for="slider">temperature:</label>
            <span id="slider-value">50</span>
            <input type="range" min="0" max="100" value="${this.temperature}" id="slider">

            <label for="sliderTokens">Max tokens:</label>
            <span id="sliderTokens-value">50</span>
            <input type="range" min="10" max="2048" value="${this.maxTokens}" id="sliderTokens">
            
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                const writeTestFunctionBtn = document.getElementById("writeTestFunctionBtn");
                writeTestFunctionBtn.addEventListener("click", () => {
                    vscode.postMessage({ type: "command", command: "extension.writeTestFunction" });
                });
                const checkbox = document.getElementById("checkbox");
                const chatbotAnsweringBtn = document.getElementById("chatbotAnsweringBtn");
                chatbotAnsweringBtn.addEventListener("click", () => {
                    vscode.postMessage({ type: "command", command: "extension.chatbotFunction" });
                });

                const continueBtn = document.getElementById("continueBtn");
                continueBtn.addEventListener("click", () => {
                    vscode.postMessage({ type: "command", command: "extension.continueFunction" });
                });

                checkbox.addEventListener("change", (event) => {
                    const inputValue = event.target.checked;
                    vscode.postMessage({ type: "inputValue", value: inputValue });
                });

                var slider = document.getElementById("slider");
                var output = document.getElementById("slider-value");
                output.innerHTML = slider.value;

                slider.oninput = function() {
                    output.innerHTML = this.value;
                    vscode.postMessage({ type: "temperature", value: this.value });
                }

                var sliderTokens = document.getElementById("sliderTokens");
                var outputTokens = document.getElementById("sliderTokens-value");
                outputTokens.innerHTML = sliderTokens.value;

                sliderTokens.oninput = function() {
                    outputTokens.innerHTML = this.value;
                    vscode.postMessage({ type: "maxTokens", value: this.value });
                }
            </script>
        </body>
        </html>`;
    }
}


module.exports = { SidebarProvider };
