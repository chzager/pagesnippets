/*
pageSnippets (https://github.com/suppenhuhn79/pagesnippets)
Copyright 2021 Christoph Zager, licensed under the Apache License, Version 2.0
See the full license text at http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * @deprecated Use pagesnippets2.js instead.
 */
const pageSnippets =
{
	NAMESPACE_URI: "https://github.com/suppenhuhn79/pagesnippets",
	import: (url) =>
	{
		function _fetch (url)
		{
			return new Promise((resolve, reject) =>
			{
				fetch(url).then(
					(response) => (response.status === 200) ? resolve(response.text()) : reject(new ReferenceError("Server returned " + response.status + " (" + response.statusText + ") when trying to fetch " + response.url)),
					(reason) => reject(reason));
			});
		};
		function _produce (owner = window, data = {}, _parentSnippetKey = "")
		{
			const NODETYPE_ELEMENT = 1;
			const NODETYPE_TEXT = 3;
			const HTML_NAMESPACE_URI = "http://www.w3.org/1999/xhtml";
			function __getObjectValueByPath (object, path, pathSeparator = ".")
			{
				let result = undefined;
				if (!!object && !!path)
				{
					let steps = path.split(pathSeparator);
					result = (steps.length === 1) ? object[steps[0]] : __getObjectValueByPath(object[steps[0]], steps.splice(1).join(pathSeparator), pathSeparator);
				}
				return result;
			}
			function __resolveVariables (sourceNode, text, data, stringTransformer = null)
			{
				let rex = /\{\{(.*?)\}\}/g;
				let result = text;
				let rexResult = rex.exec(text);
				while (!!rexResult)
				{
					let value = __getObjectValueByPath(data, rexResult[1], ".");
					if (value === undefined)
					{
						console.info("\"" + rexResult[1] + "\" is not defined, set to <empty-string>.", sourceNode, currentSnippetKey);
						value = "";
					}
					result = result.replace("{{" + rexResult[1] + "}}", ((typeof stringTransformer === "function") ? stringTransformer(String(value)) : value));
					rexResult = rex.exec(text);
				}
				return result;
			}
			function __resolveUnicodeEntities (text)
			{
				let rex = /&#x([0-9a-f]+);/i;
				let rem = rex.exec(text);
				while (rem)
				{
					text = text.replace(rem[0], JSON.parse("\"\\u" + rem[1].padStart(4, "0") + "\""));
					rem = /&#x([0-9a-f]+);/i.exec(text);
				}
				return text;
			}
			function __addAttributes (sourceNode, targetElement, owner, data)
			{
				for (let attribute of sourceNode.attributes)
				{
					if (attribute.namespaceURI === pageSnippets.NAMESPACE_URI)
					{
						if (/^on\S+/.test(attribute.localName))
						{
							let referencedFunction = __getObjectValueByPath(owner, attribute.value);
							if (typeof referencedFunction === "function")
							{
								targetElement[attribute.localName] = referencedFunction;
							}
							else
							{
								console.warn("Event handler \"" + attribute.value + "\" is not defined.", sourceNode, currentSnippetKey);
							}
						}
						else if (attribute.localName !== "postproduction")
						{
							console.warn("Attribute not allowed \"" + attribute.name + "\".", sourceNode, currentSnippetKey);
						}
					}
					else
					{
						targetElement.setAttributeNS(attribute.namespaceURI, attribute.localName, __resolveVariables(sourceNode, attribute.value, data));
					}
				}
			}
			function __processNode (sourceNode, targetElement, owner, data)
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
										__psCallFunction(childSourceNode, targetElement, owner, data);
										break;
									case "choose":
										__psChoose(childSourceNode, targetElement, owner, data);
										break;
									case "for-each":
										__psForEach(childSourceNode, targetElement, owner, data);
										break;
									case "for-empty":
										__psForEmpty(childSourceNode, targetElement, owner, data);
										break;
									case "if":
										__psIf(childSourceNode, targetElement, owner, data);
										break;
									case "insert-snippet":
										__psInsertSnippet(childSourceNode, targetElement, owner, data);
										break;
									case "text":
										targetElement.appendChild(document.createTextNode(__resolveUnicodeEntities(__resolveVariables(childSourceNode, childSourceNode.firstChild.data, data))));
										break;
									default:
										console.warn("Element not allowed here.", childSourceNode, currentSnippetKey);
								}
							}
							else
							{
								let element = document.createElementNS(childSourceNode.namespaceURI ?? HTML_NAMESPACE_URI, childSourceNode.tagName);
								__addAttributes(childSourceNode, element, owner, data);
								__processNode(childSourceNode, element, owner, data);
								__psPostProduction(childSourceNode, element, owner, data);
								targetElement.appendChild(element);
							}
							break;
						case NODETYPE_TEXT:
							if (/^\s*$/.test(childSourceNode.textContent) === false)
							{
								targetElement.appendChild(document.createTextNode(__resolveUnicodeEntities(__resolveVariables(sourceNode, childSourceNode.textContent, data))));
							}
							break;
					}
				}
			}
			function __psPostProduction (sourceNode, targetElement, owner, data)
			{
				let postProductionFunctionName = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "postproduction");
				if (!!postProductionFunctionName)
				{
					targetElement.removeAttributeNS(pageSnippets.NAMESPACE_URI, "postproduction");
					let referencedFunction = __getObjectValueByPath(owner, postProductionFunctionName);
					if (typeof referencedFunction === "function")
					{
						referencedFunction(targetElement, data);
					}
					else
					{
						console.error("Postproduction function \"" + postProductionFunctionName + "\" is not defined.", sourceNode, currentSnippetKey);
					}
				}
			}
			function __psCallFunction (sourceNode, targetElement, owner, data)
			{
				let functionName = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "name") ?? sourceNode.getAttribute("name");
				let referencedFunction = __getObjectValueByPath(owner, functionName);
				if (typeof referencedFunction === "function")
				{
					referencedFunction(targetElement, data);
				}
				else
				{
					console.error("Function to call \"" + functionName + "\" is not defined.", sourceNode, currentSnippetKey);
				}
			}
			function __psForEach (sourceNode, targetElement, owner, data)
			{
				let listKey = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "list") ?? sourceNode.getAttribute("list");
				if (!!data[listKey])
				{
					let variablesList = data[listKey];
					for (let i = 0, ii = variablesList.length; i < ii; i += 1)
					{
						let listItem = (["string", "number", "boolean"].includes(typeof variablesList[i])) ? { "_value": variablesList[i] } : Object.assign({}, variablesList[i]);
						listItem["_position"] = i + 1;
						listItem["_count"] = ii;
						__processNode(sourceNode, targetElement, owner, Object.assign({}, data, listItem));
					}
				}
				else
				{
					console.warn("\"" + listKey + "\" is not defined.", sourceNode, currentSnippetKey);
				}
			}
			function __psForEmpty (sourceNode, targetElement, owner, data)
			{
				let listKey = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "list") ?? sourceNode.getAttribute("list");
				if ((!data[listKey]) || (data[listKey].length === 0))
				{
					__processNode(sourceNode, targetElement, owner, data);
				}
			}
			function __psChoose (sourceNode, targetElement, owner, data)
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
								let thisMatch = __psIf(childSourceNode, targetElement, owner, data);
								anyMatch = anyMatch || thisMatch;
								break;
							case "else":
								if (anyMatch === false)
								{
									__processNode(childSourceNode, targetElement, owner, data);
								}
								break;
							default:
								console.warn("Element not allowed here.", childSourceNode, currentSnippetKey);
						}
						if (anyMatch && (chooseMode === CHOOSE_MODE_STRICT))
						{
							break;
						}
					}
					else
					{
						console.warn("Element not allowed here.", childSourceNode, currentSnippetKey);
					}
				}
			}
			function __psIf (sourceNode, targetElement, owner, data)
			{
				let testExpression = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "test") ?? sourceNode.getAttribute("test");
				testExpression = __resolveVariables(sourceNode, testExpression, data, (str) => str.replace("'", "\\'"));
				let testResult;
				try
				{
					testResult = eval(testExpression);
				}
				catch (ex)
				{
					console.error("Cannot evaluate expression \"" + testExpression + "\": " + ex.message, sourceNode, currentSnippetKey);
				}
				if (testResult === true)
				{
					__processNode(sourceNode, targetElement, owner, data);
				}
				return testResult;
			}
			function __psInsertSnippet (sourceNode, targetElement, owner, data)
			{
				let snippetPath = sourceNode.getAttributeNS(pageSnippets.NAMESPACE_URI, "name") ?? sourceNode.getAttribute("name");
				let snippet;
				try
				{
					snippet = __getObjectValueByPath(pageSnippets, snippetPath, "/");
				}
				finally
				{
					if (!!snippet)
					{
						targetElement.appendChild(snippet.produce(owner, data, currentSnippetKey));
					}
					else
					{
						console.error("Unknown snippet \"" + snippetPath + "\".", sourceNode, currentSnippetKey);
					}
				}
			}
			let currentSnippetKey = ((_parentSnippetKey !== "") ? _parentSnippetKey + "->" : "") + "@" + this.src + ":" + this.snippetKey;
			let result = document.createElementNS(this.namespaceURI ?? HTML_NAMESPACE_URI, this.localName);
			__addAttributes(this, result, owner, data);
			__processNode(this, result, owner, data);
			__psPostProduction(this, result, owner, data);
			return result;
		};
		return new Promise((resolve, reject) => _fetch(url).then(
			(data) =>
			{
				function _cleanPath (path)
				{
					let templateRoot = url.replace(/[^./]+\.[\S]+$/, "");
					return templateRoot.concat(path).replace(/[^/]+\/\.\.\//g, "");
				}
				function _parse (node, targetObject, groupName, scriptsCollection)
				{
					for (let childNode of node.children)
					{
						if (childNode.namespaceURI === pageSnippets.NAMESPACE_URI)
						{
							if (childNode.localName === "snippet")
							{
								_appendSnippet(childNode, targetObject, groupName);
							}
							else if (childNode.localName === "snippet-group")
							{
								let childGroupName = childNode.getAttribute("name");
								targetObject[childGroupName] ??= {};
								_parse(childNode, targetObject[childGroupName], groupName + ((groupName !== "") ? "/" : "") + childGroupName, scriptsCollection);
							}
							else if ((groupName === "") && (childNode.localName === "stylesheet"))
							{
								_includeStylesheet(childNode);
							}
							else if ((groupName === "") && (childNode.localName === "script"))
							{
								scriptsCollection.push(childNode);
							}
							else
							{
								console.warn("Element not allowed here.", childNode, "@" + url + ":" + ((groupName === "") ? "(root)" : groupName));
							}
						}
						else
						{
							console.warn("Unexpected element.", childNode, "@" + url + ":" + ((groupName === "") ? "(root)" : groupName));
						}
					}
				}
				function _appendSnippet (node, targetObject, groupName)
				{
					let snippetName = node.getAttribute("name");
					targetObject[snippetName] = Object.assign(node.firstElementChild,
						{
							snippetKey: groupName + ((groupName !== "") ? "/" : "") + node.getAttribute("name"),
							src: url,
							produce: _produce
						});
					if (node.childElementCount > 1)
					{
						console.warn("Only one child element allowed.", node, "@" + url + ":" + ((groupName === "") ? "(root)" : groupName));
					}
				}
				function _includeStylesheet (node)
				{
					let styleNode = document.createElement("link");
					let src = _cleanPath(node.getAttribute("src"));
					if (document.querySelector("link[rel=\"stylesheet\"][href=\"" + src + "\"]") === null)
					{
						styleNode.setAttribute("rel", "stylesheet");
						styleNode.setAttribute("href", src);
						document.head.appendChild(styleNode);
					}
				}
				function _includeScripts (scriptsCollection)
				{
					let scriptsToLoad = scriptsCollection.length;
					function __onScriptLoadend (loadEvent)
					{
						if (loadEvent.type === "error")
						{
							console.error("Error while loading \"" + loadEvent.target.src + "\"", loadEvent.target, "@" + url + ":(root)");
						}
						if ((scriptsToLoad -= 1) === 0)
						{
							resolve();
						}
					}
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
						}
					}
					if ((scriptsCollection.length === 0) || (scriptsToLoad === 0))
					{
						resolve();
					}
				}
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
				}
			},
			(ex) => reject(new Error(ex)))
		);
	}
};
