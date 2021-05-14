"use strict";

/*
pageSnippets (https://github.com/suppenhuhn79/pagesnippets)
Copyright 2021 Christoph Zager, licensed under the Apache License, Version 2.0
See the full license text at http://www.apache.org/licenses/LICENSE-2.0
 */

const pageSnippets =
{
	NAMESPACE_URI: "https://github.com/Suppenhuhn79/pagesnippets"
};

pageSnippets.import = function (url)
{
	function __fetch(url)
	{
		return new Promise((resolve, reject) =>
		{
			fetch(url).then(
				(response) => (response.status === 200) ? resolve(response.text()) : reject(response),
				(reason) => reject(reason))
		}
		);
	};
	return new Promise((resolve, reject) => __fetch(url).then(
			(data) =>
		{
			function _cleanPath(path)
			{
				let templateRoot = url.replace(/[^./]+\.[\S]+$/, "");
				let result = templateRoot.concat(path).replace(/[^/]+\/\.\.\//g, "");
				return result;
			};
			function _parse(node, targetObject, groupName, scriptsCollection)
			{
				for (let childNode of node.children)
				{
					if (childNode.namespaceURI === pageSnippets.NAMESPACE_URI)
					{
						switch (childNode.localName)
						{
						case "snippet":
							_appendSnippet(childNode, targetObject, groupName);
							break;
						case "snippet-group":
							let childGroupName = childNode.getAttribute("name");
							targetObject[childGroupName] = targetObject[childGroupName] ?? {};
							_parse(childNode, targetObject[childGroupName], groupName + childGroupName + "/", scriptsCollection);
							break;
						default:
							if (groupName === "")
							{
								switch (childNode.localName)
								{
								case "stylesheet":
									_includeStylesheet(childNode);
									break;
								case "script":
									scriptsCollection.push(childNode);
									break;
								default:
									console.warn("Unknown element.", childNode, url + ":(root)");
								};
							}
							else
							{
								console.warn("Element not allowed here.", childNode, url + ":" + groupName);
							};
						};
					}
					else
					{
						console.warn("Unexpected element.", childNode, url + ":" + ((groupName === "") ? "(root)" : groupName))
					};
				};
			};
			function _appendSnippet(node, targetObject, groupName)
			{
				let snippetName = node.getAttribute("name");
				targetObject[snippetName] = node.firstElementChild;
				targetObject[snippetName].snippetKey = groupName + node.getAttribute("name");
				targetObject[snippetName].produce = pageSnippets.__produce;
				if (node.childElementCount > 1)
				{
					console.warn("Only one child element allowed.", node, url + ":" + groupName + "/");
				};
			};
			function _includeStylesheet(node)
			{
				let styleNode = document.createElement("link");
				let src = _cleanPath(node.getAttribute("src"));
				if (document.querySelector("link[rel=\"stylesheet\"][href=\"" + src + "\"]") === null)
				{
					styleNode.setAttribute("rel", "stylesheet");
					styleNode.setAttribute("href", src);
					document.head.appendChild(styleNode);
				};
			};
			function _includeScripts(scriptsCollection)
			{
				let scriptsToLoad = scriptsCollection.length;
				function __onScriptLoadend(loadEvent)
				{
					if (loadEvent.type === "error")
					{
						console.error("Error while loading \"" + loadEvent.target.src + "\"", loadEvent.target, url + ":(root)");
					};
					if ((scriptsToLoad -= 1) === 0)
					{
						resolve();
					};
				};
				for (let scriptNode of scriptsCollection)
				{
					let src = _cleanPath(scriptNode.getAttribute("src"));
					if (document.querySelector("script[src=\"" + src + "\"]") === null)
					{
						let scriptNode = document.createElement("script");
						scriptNode.setAttribute("src", src);
						scriptNode.addEventListener("load", __onScriptLoadend);
						scriptNode.addEventListener("error", __onScriptLoadend);
						document.head.appendChild(scriptNode);
					}
					else
					{
						scriptsToLoad -= 1;
					};
				};
				if ((scriptsCollection.length === 0) || (scriptsToLoad === 0))
				{
					resolve();
				};
			};
			let xmlDocument = new DOMParser().parseFromString(data, "text/xml");
			if ((xmlDocument.documentElement.namespaceURI === pageSnippets.NAMESPACE_URI) && (xmlDocument.documentElement.localName === "pagesnippets"))
			{
				let scriptsCollection = [];
				_parse(xmlDocument.firstElementChild, pageSnippets, "", scriptsCollection);
				_includeScripts(scriptsCollection); // this does finally resolve()
			}
			else
			{
				reject(new Error("\"" + url + "\" it not a pagesnippets XML-document."));
			};
		},
			(ex) => reject(new Error(ex))));
};

pageSnippets.__produce = function (owner = window, variables = {}, targetNamespaceURI = null)
{
	const NODETYPE_ELEMENT = 1;
	const NODETYPE_TEXT = 3;
	function _getObjectValueByPath(object, path, pathSeparator = ".")
	{
		let result;
		if (!!object)
		{
			let steps = path.split(pathSeparator);
			if (steps.length === 1)
			{
				result = object[steps[0]];
			}
			else
			{
				result = _getObjectValueByPath(object[steps[0]], steps.splice(1).join(pathSeparator), pathSeparator);
			};
		};
		return result;
	};
	function _resolveVariables(sourceNode, text, variables, stringTransformer = null)
	{
		let rex = /\{\{(.*?)\}\}/g;
		let result = text;
		let rexResult = rex.exec(text);
		while (!!rexResult)
		{
			let value = _getObjectValueByPath(variables, rexResult[1], ".");
			if (value === undefined)
			{
				console.info("\"" + rexResult[1] + "\" is not defined, set to <empty-string>.", sourceNode, currentSnippetKey);
				value = "";
			};
			result = result.replace("{{" + rexResult[1] + "}}", ((typeof stringTransformer === "function") ? stringTransformer(String(value)) : value));
			rexResult = rex.exec(text);
		};
		return result;
	};
	function _addAttributes(sourceNode, targetElement, owner, variables, targetNamespaceURI)
	{
		for (let attribute of sourceNode.attributes)
		{
			if ((attribute.namespaceURI === pageSnippets.NAMESPACE_URI) && (/on\S+/.test(attribute.localName)))
			{
				if (typeof owner[attribute.value] === "function")
				{
					targetElement[attribute.localName] = owner[attribute.value];
				}
				else
				{
					console.warn("Event handler \"" + attribute.value + "\" is not defined.", sourceNode, currentSnippetKey);
				};
			}
			else
			{
				(!!targetNamespaceURI) ? targetElement.setAttributeNS(targetNamespaceURI, attribute.name, _resolveVariables(sourceNode, attribute.value, variables)) : targetElement.setAttribute(attribute.localName, _resolveVariables(sourceNode, attribute.value, variables));
			};
		};
	};
	function _processNode(sourceNode, targetElement, owner, variables, targetNamespaceURI)
	{
		for (let childSourceNode of sourceNode.childNodes)
		{
			switch (childSourceNode.nodeType)
			{
			case NODETYPE_ELEMENT:
				if (childSourceNode.namespaceURI === pageSnippets.NAMESPACE_URI)
				{
					switch (childSourceNode.localName)
					{
					case "call-function":
						_psCallFunction(childSourceNode, targetElement, owner, variables, targetNamespaceURI);
						break;
					case "choose":
						_psChoose(childSourceNode, targetElement, owner, variables, targetNamespaceURI);
						break;
					case "for-each":
						_psForEach(childSourceNode, targetElement, owner, variables, targetNamespaceURI);
						break;
					case "for-empty":
						_psForEmpty(childSourceNode, targetElement, owner, variables, targetNamespaceURI);
						break;
					case "if":
						_psIf(childSourceNode, targetElement, owner, variables, targetNamespaceURI);
						break;
					case "insert-snippet":
						_psInsertSnippet(childSourceNode, targetElement, owner, variables, targetNamespaceURI);
						break;
					case "text":
						targetElement.appendChild(document.createTextNode(_resolveVariables(childSourceNode, childSourceNode.firstChild.data, variables)));
						break;
					default:
						console.warn("Element not allowed here.", childSourceNode, currentSnippetKey);
					};
				}
				else
				{
					let element = (!!targetNamespaceURI) ? document.createElementNS(targetNamespaceURI, childSourceNode.tagName) : document.createElement(childSourceNode.localName);
					_addAttributes(childSourceNode, element, owner, variables, targetNamespaceURI);
					_processNode(childSourceNode, element, owner, variables, targetNamespaceURI);
					_psPostProduction(childSourceNode, element, owner, variables, targetNamespaceURI);
					targetElement.appendChild(element);
				};
				break;
			case NODETYPE_TEXT:
				if (/^\s*$/.test(childSourceNode.textContent) === false)
				{
					targetElement.appendChild(document.createTextNode(_resolveVariables(sourceNode, childSourceNode.textContent, variables)));
				};
				break;
			};
		};
	};
	function _psPostProduction(sourceNode, targetElement, owner, variables, targetNamespaceURI)
	{
		let postProductionFunction = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "postproduction");
		if (!!postProductionFunction)
		{
			targetElement.removeAttributeNS(pageSnippets.NAMESPACE_URI, "postproduction");
			if (typeof owner[postProductionFunction] === "function")
			{
				owner[postProductionFunction](targetElement, variables);
			}
			else
			{
				console.error("Postproduction function \"" + postProductionFunction + "\" is not defined.", sourceNode, currentSnippetKey);
			};
		};
	};
	function _psCallFunction(sourceNode, targetElement, owner, variables, targetNamespaceURI)
	{
		let functionName = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "name") ?? sourceNode.getAttribute("name");
		if (typeof owner[functionName] === "function")
		{
			owner[functionName](targetElement, variables);
		}
		else
		{
			console.error("Function to call \"" + functionName + "\" is not defined.", sourceNode, currentSnippetKey);
		};
	};
	function _psForEach(sourceNode, targetElement, owner, variables, targetNamespaceURI)
	{
		let listKey = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "list") ?? sourceNode.getAttribute("list");
		if (!!variables[listKey])
		{
			let variablesList = variables[listKey];
			for (let i = 0, ii = variablesList.length; i < ii; i += 1)
			{
				let listItem = (["string", "number", "boolean"].includes(typeof variablesList[i])) ?
				{
					"_value": variablesList[i]
				}
				 : variablesList[i];
				listItem["_position"] = i + 1;
				listItem["_count"] = ii;
				_processNode(sourceNode, targetElement, owner, listItem, targetNamespaceURI);
			};
		}
		else
		{
			console.error("\"" + listKey + "\" is not defined.", sourceNode, currentSnippetKey);
		};
	};
	function _psForEmpty(sourceNode, targetElement, owner, variables, targetNamespaceURI)
	{
		let listKey = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "list") ?? sourceNode.getAttribute("list");
		if (!!variables[listKey])
		{
			if (variables[listKey].length === 0)
			{
				_processNode(sourceNode, targetElement, owner, variables, targetNamespaceURI);
			};
		}
		else
		{
			console.error("\"" + listKey + "\" is not defined.", sourceNode, currentSnippetKey);
		};
	};
	function _psChoose(sourceNode, targetElement, owner, variables, targetNamespaceURI)
	{
		const CHOOSE_MODE_STRICT = "strict";
		const CHOOSE_MODE_LAX = "lax";
		let chooseMode = (RegExp("^" + CHOOSE_MODE_STRICT + "$|^" + CHOOSE_MODE_LAX + "$").exec((sourceNode.getAttribute("mode") ?? CHOOSE_MODE_STRICT)) ?? [""])[0];
		if (chooseMode === "")
		{
			console.warn("Invalid choose-mode \"" + sourceNode.getAttribute("mode") + "\", using \"strict\".", sourceNode, currentSnippetKey);
			chooseMode = CHOOSE_MODE_STRICT;
		}
		let anyMatch = false;
		for (let childSourceNode of sourceNode.children)
		{
			if (childSourceNode.namespaceURI === pageSnippets.NAMESPACE_URI)
			{
				switch (childSourceNode.localName)
				{
				case "if":
					let thisMatch = _psIf(childSourceNode, targetElement, owner, variables, targetNamespaceURI);
					anyMatch = anyMatch || thisMatch;
					break;
				case "else":
					if (anyMatch === false)
					{
						_processNode(childSourceNode, targetElement, owner, variables, targetNamespaceURI);
					};
				break;
					default:
					console.warn("Element not allowed here.", childSourceNode, currentSnippetKey);
				};
				if (anyMatch && (chooseMode === CHOOSE_MODE_STRICT))
				{
					break;
				};
			}
			else
			{
				console.warn("Element not allowed here.", childSourceNode, currentSnippetKey);
			};
		};
	}
	function _psIf(sourceNode, targetElement, owner, variables, targetNamespaceURI)
	{
		let testExpression = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "test") ?? sourceNode.getAttribute("test");
		testExpression = _resolveVariables(sourceNode, testExpression, variables, (str) => str.replace("'", "\\'"));
		let testResult;
		try
		{
			testResult = eval(testExpression)
		}
		catch (ex)
		{
			console.error("Cannot evaluate expression \"" + testExpression + "\": " + ex.message, sourceNode, currentSnippetKey);
		};
		if (testResult === true)
		{
			_processNode(sourceNode, targetElement, owner, variables, targetNamespaceURI);
		};
		return testResult;
	};
	function _psInsertSnippet(sourceNode, targetElement, owner, variables, targetNamespaceURI)
	{
		let snippetPath = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "name") ?? sourceNode.getAttribute("name");
		let snippet;
		try
		{
			snippet = _getObjectValueByPath(pageSnippets, snippetPath, "/");
		}
		finally
		{
			if (!!snippet)
			{
				targetElement.appendChild(snippet.produce(owner, variables, targetNamespaceURI));
			}
			else
			{
				console.error("Unknown snippet \"" + snippetPath + "\".", sourceNode, currentSnippetKey);
			};
		};
	};
	let currentSnippetKey = this.snippetKey;
	let result = (!!targetNamespaceURI) ? document.createElementNS(targetNamespaceURI, this.tagName) : document.createElement(this.localName);
	_addAttributes(this, result, owner, variables, targetNamespaceURI);
	_processNode(this, result, owner, variables, targetNamespaceURI);
	_psPostProduction(this, result, owner, variables, targetNamespaceURI);
	return result;
};
