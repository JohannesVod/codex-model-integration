// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
const SidebarProvider = require('./Sidebar/SidebarProvider').SidebarProvider;
const { Configuration, OpenAIApi } = require("openai");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json

	let disposable2 = vscode.commands.registerCommand("extension.writeTestFunction", async () => {
		const configuration = new Configuration({
		apiKey: process.env.OPENAI_API_KEY,
		});
		const openai = new OpenAIApi(configuration);

		const response = await openai.createCompletion({
		model: "code-davinci-002",
		prompt: "class Log:\n    def __init__(self, path):\n        dirname = os.path.dirname(path)\n        os.makedirs(dirname, exist_ok=True)\n        f = open(path, \"a+\")\n\n        # Check that the file is newline-terminated\n        size = os.path.getsize(path)\n        if size > 0:\n            f.seek(size - 1)\n            end = f.read(1)\n            if end != \"\\n\":\n                f.write(\"\\n\")\n        self.f = f\n        self.path = path\n\n    def log(self, event):\n        event[\"_event_id\"] = str(uuid.uuid4())\n        json.dump(event, self.f)\n        self.f.write(\"\\n\")\n\n    def state(self):\n        state = {\"complete\": set(), \"last\": None}\n        for line in open(self.path):\n            event = json.loads(line)\n            if event[\"type\"] == \"submit\" and event[\"success\"]:\n                state[\"complete\"].add(event[\"id\"])\n                state[\"last\"] = event\n        return state\n\n\"\"\"\nHere's what the above class is doing:\n1.",
		temperature: 0,
		max_tokens: 64,
		top_p: 1.0,
		frequency_penalty: 0.0,
		presence_penalty: 0.0,
		stop: ["\"\"\""],
		}).then((res) => {console.log(res.data.choices[0].text)});
	});

	let disposable3 = vscode.commands.registerCommand("extension.chatbotFunction", async () => {
		vscode.window.showInformationMessage("Chatbot command executed");
	});

	let disposable4 = vscode.commands.registerCommand("extension.continueFunction", async () => {
		vscode.window.showInformationMessage("Coninue Function command executed");
	});

	const sidebarProvider = new SidebarProvider(context.extensionUri);
	context.subscriptions.push(
	  vscode.window.registerWebviewViewProvider(
		"vsCodex-sidebar",
		sidebarProvider
	  )
	);

	context.subscriptions.push(disposable2);
	context.subscriptions.push(disposable3);
	context.subscriptions.push(disposable4);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}

