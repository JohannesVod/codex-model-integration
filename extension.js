// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
const SidebarProvider = require('./Sidebar/SidebarProvider').SidebarProvider;
const { Configuration, OpenAIApi } = require("openai");
const axios = require("axios");
const { visitParameterList, convertToObject } = require('typescript');
const fs = require("fs");
const path = require('path');
const { resolveCliArgsFromVSCodeExecutablePath } = require('@vscode/test-electron');
const { cursorTo } = require('readline');

/**
 * @param {vscode.ExtensionContext} context
 */

let is_running = false;
let sidebarProvider = null;


const GetFromPrompt = async (prompt, callback) => {
	try {
	const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
	});
	let maxTokens = parseInt(sidebarProvider.maxTokens, 10);
	const openai = new OpenAIApi(configuration);
    const completion = await openai.createCompletion(
        {
			model: "code-davinci-002",
			prompt: prompt,
			temperature: sidebarProvider.temperature/100,
			max_tokens: maxTokens,
			top_p: 1.0,
			frequency_penalty: 0.0,
			presence_penalty: 0.0,
			stream: true,
			stop: ["\"\"\"", '"answer end"', '"Testfunction end"']
        },
        { responseType: "stream" }
    );
    return new Promise((resolve) => {
        let result = "";
        completion.data.on("data", (data) => {
            const lines = data.toString()
                .split("\n")
                .filter((line) => line.trim() !== "");
            for (const line of lines) {
                const message = line.replace(/^data: /, "");
                if (message == "[DONE]") {
                    resolve(result);
                } else {
                    let token;
                    try {
                        token = JSON.parse(message).choices[0].text;
                    } catch (err){
                        console.log("ERROR");
                    }
                    result += token;
                    if (token) {
                        callback(token);
                    }
                }
            }
        });
    });
	} catch (error) {
		if (error.response.status == 401){
			vscode.window.showInformationMessage("Could not connect to openai(error 401)! See https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety for more instructions");
		}
		else if (error.response.status == 400){
			vscode.window.showInformationMessage("Could not connect to openai(error 400)! Maybe try to lower max tokens");
		}
		else 
		{
			vscode.window.showInformationMessage(`Could not connect to openai(error${error.response.status}) ! Reason: unknown. Maybe try again later:(`);
		}
		console.log(error);
	}
};

function buildPromptWriteTestFunction(textsofar){
	let filePath = path.join(__dirname, './prompts/CustomPreprompt.txt');
	let text = fs.readFileSync(filePath, "utf8");

	return text.replace("{<HERE INPUT IS PUT. DO NOT REMOVE>}", textsofar);
}

function buildPromptChatbot(scrapedList, input){
	let filePath = path.join(__dirname, './prompts/Chatbot.txt');
	if (!sidebarProvider.is_scraping){
		filePath = path.join(__dirname, './prompts/ChatbotNoScrape.txt');
	}
	
	let text = fs.readFileSync(filePath, "utf8");
	if (sidebarProvider.is_scraping){
		let scraped_text = "";
		for (let item of scrapedList){
			scraped_text += item + "\n";
		}
		text = text.replace("{<HERE SCRAPED IS PUT. DO NOT REMOVE>}", scraped_text);
	}
	return text.replace("{<HERE INPUT IS PUT. DO NOT REMOVE>}", input);
}

function buildPromptWriteContinue(input){
	return input;
}

async function buildPromptTags(input){
	let result = null;
	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Generating search tags...",
		cancellable: true
	}, async () => 
	{
		let filePath = path.join(__dirname, './prompts/GetTags.txt');

		let text = fs.readFileSync(filePath, "utf8");
		let prompt = text.replace("{<HERE INPUT IS PUT. DO NOT REMOVE>}", input);
		const configuration = new Configuration({
			apiKey: process.env.OPENAI_API_KEY, 
		});
		const openai = new OpenAIApi(configuration);
		
		try{
		// call the function with a keyword string
		await openai.createCompletion({
			model: "code-davinci-001",
			prompt: prompt,
			temperature: sidebarProvider.temperature/100,
			max_tokens: 128,
			top_p: 1.0,
			frequency_penalty: 0.0,
			presence_penalty: 0.0,
			stop: ["\"\"\"", "<tags end>"],
			}).then(async (res) => 
			{
				// after getting the result;
				result = res.data.choices[0].text;
			})
		} catch (error) {
			console.log(error);
		}
	})
	return result;
}

function GetCurrentText(){
	const editor = vscode.window.activeTextEditor;
	const selection = editor.selection;
	let text = editor.document.getText(selection);
	
	if (selection.isEmpty) {
		let position = selection.active;
		let range = new vscode.Range(0, 0, position.line, position.character);
		text = editor.document.getText(range);
	}
	return text;
}



var stored_edits = [];
var is_editing = false;

async function WriteResult(text){
	text = text.replace("\r", "");
	stored_edits.push(text);

	if (is_editing == true){
		return;
	}
	
	while (stored_edits.length >= 1){
		is_editing = true;
		let result = stored_edits.shift();
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			let selection = editor.selection;
			let editSucceeded = false;
			let curr_tries = 0;
			while (!editSucceeded && curr_tries < 100){
				editSucceeded = await vscode.window.activeTextEditor.edit(editBuilder => {
					let add_point = selection.active;
					if (selection.end.isAfter(selection.active)){
						add_point = selection.end;
					}
					editBuilder.insert(add_point, result);
				}, { undoStopBefore: false, undoStopAfter: false });
				curr_tries += 1;
			}
		}
		is_editing = false;
	}
}

function activate(context) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json

	context.subscriptions.push(vscode.commands.registerCommand('extension.writeTestFunction', () => {
		if (is_running){
			vscode.window.showInformationMessage("Already running!");
			return;
		}
		
		is_running = true;
		let text = "";
		try {
			text = GetCurrentText();
		} catch (error) {
			vscode.window.showInformationMessage("Please go to a file!");
			is_running = false;
			return;
		}
		if (text.length <= 10){
			vscode.window.showInformationMessage("Please select some text!");
			is_running = false;
			return;
		}
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Writing test function!`,
			cancellable: true
		}, async (progress, token) => 
		{
			let continue_writing = true;
			token.onCancellationRequested(() => {
				console.log('User canceled the progress.');
				is_running = false;
				continue_writing = false;
			});
			let prompt = buildPromptWriteTestFunction(text);
			
			// Create a workspace edit object
			await GetFromPrompt(prompt, (c) => {if (continue_writing){WriteResult(c);}});
			is_running = false;
		})
	}));

	context.subscriptions.push(vscode.commands.registerCommand("extension.chatbotFunction", async () => {
		try {
		if (is_running){
			vscode.window.showInformationMessage("Already running!");
			return;
		}
		
		is_running = true;
		let text = "";
		try {
			text = GetCurrentText();
		} catch (error) {
			vscode.window.showInformationMessage("Please go to a file!");
			is_running = false;
			return;
		}
		if (text.length <= 10){
			vscode.window.showInformationMessage("Please select some text!");
			is_running = false;
			return;
		}
		
		let scraped = [];
		let tags = "";

		if (sidebarProvider.is_scraping){
			tags = await buildPromptTags(text);
			let scraped_tuple = await scrapeStackOverflow(tags, 2, sidebarProvider.is_scraping);
			scraped = scraped_tuple[0];
			sidebarProvider.SetScrapedSources(tags, scraped_tuple[1]);
		}
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Answering question ${tags}`,
			cancellable: true
		}, async (progress, token) => 
		{
			let continue_writing = true;
			token.onCancellationRequested(() => {
				console.log('User canceled the progress.');
				is_running = false;
				continue_writing = false;
			});
			let prompt = buildPromptChatbot(scraped, text);
			await GetFromPrompt(prompt, (c) => {if (continue_writing){WriteResult(c);}});
			is_running = false;
		})
		} catch (error) {
			console.log(error);		
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand("extension.continueFunction", async () => {
		try{
		if (is_running){
			vscode.window.showInformationMessage("Already running!");
			return;
		}
		is_running = true;
		let text = "";
		try {
			text = GetCurrentText();
		} catch (error) {
			vscode.window.showInformationMessage("Please go to a file!");
			is_running = false;
			return;
		}
		if (text.length <= 10){
			vscode.window.showInformationMessage("Please select some text!");
			is_running = false;
			return;
		}
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Continue text!`,
			cancellable: true
		}, async (progress, token) => 
		{
			let continue_writing = true;
			token.onCancellationRequested(() => {
				console.log('User canceled the progress.');
				is_running = false;
				continue_writing = false;
			});
			let prompt = buildPromptWriteContinue(text);
			await GetFromPrompt(prompt, (c) => {if (continue_writing){WriteResult(c);}});
			is_running = false;
		})
		} catch (error) {
			console.log(error);		
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand("extension.scrapeFunction", async () => {
		try{
		if (is_running){
			vscode.window.showInformationMessage("Already running!");
			return;
		}
		is_running = true;
		let text = "";
		try {
			text = GetCurrentText();
		} catch (error) {
			vscode.window.showInformationMessage("Please go to a file!");
			is_running = false;
			return;
		}
		if (text.length <= 10){
			vscode.window.showInformationMessage("Please select some text!");
			is_running = false;
			return;
		}
		let tags = await buildPromptTags(text);
		let links = await scrapeStackOverflow(tags, 0, true);
		sidebarProvider.SetScrapedSources(tags, links[1]);
		is_running = false;
		} catch (error) {
			console.log(error);		
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand("extension.editBtnFunction", async () => {
		try{
		let filePath = vscode.Uri.file(path.join(__dirname, "prompts/CustomPreprompt.txt"));
		await vscode.commands.executeCommand("vscode.open", filePath);
		} catch (error) {
			vscode.window.showInformationMessage("Could not open file. Error:" + error.toString());
		}
	}));
	
	sidebarProvider = new SidebarProvider(context.extensionUri, context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"vsCodex-sidebar",
			sidebarProvider
		)
	);
}

// define a function that takes a keyword string s as a parameter
async function scrapeStackOverflow(s, max_sites=2, is_scraping=true, max_ans_length=300) {
	if (!is_scraping){
		return [[""], []];
	}
	// construct the API URL with the keyword and some filters
	// add filter=withbody to get the answers
	const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${s}&site=stackoverflow&filter=%21T%2ahPNRA69ofM1izkPP`;

	var questions = [];
	var foundlinks = [];
	// make a GET request to the API and handle the response
	try {
		// use await to wait for the response
		const response = await axios.get(url);
		// get the items array from the response data
		const items = response.data.items;
		let c = 0;
	  	// loop through the items and get the question and answer
		for (let item of items) {
			if (c >= max_sites){
				break;
			}
			let max_score = -1;
			let max_answer = null;
			if (item.answers != null){
				for (let answer of item.answers){
					if (max_score < answer.score){
						max_score = answer.score;
						max_answer = answer;
					}
				}
				if (max_answer != null){
					// create an object with the question and answer
					// add it to the questions array
					let answer = max_answer.body;
					if (answer.length > max_ans_length){
						answer = answer.substring(0, max_ans_length);
					}
					questions.push(`\ntitle: ${item.title}\n\nlink: ${item.link}\n\n solution:${answer}\n`);
					c ++;
				}
			}
		}
		c = 0;
		for (let item of items) {
			if (c >= 10){
				break;
			}
			foundlinks.push([item.title, item.link]);
			c += 1;
		}
		// return the questions/links array
		return [questions, foundlinks];
	} catch (error) {
	  	// handle any errors
	  	console.log("Error when scraping: " + error);
		return [[""], []];
	}
}
  

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}

