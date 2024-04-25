/// <reference path="./pagesnippets2.d.js" />
/**
 * PageSnippets - dynamically load and produce HTML or XML.
 * @version 2.1
 * @copyright Copyright 2023 Christoph Zager
 * @link https://github.com/suppenhuhn79/pagesnippets
 * @license Apache-2.0 - See the full license text at http://www.apache.org/licenses/LICENSE-2.0
 */
let pageSnippets = new function ()
{
	/**
	 * PageSnippets XML scheme namespace URI.
	 */
	const PS_NAMESPACE_URI = "https://github.com/suppenhuhn79/pagesnippets";

	/**
	 * HTML namespace URI.
	 */
	const HTML_NAMESPACE_URI = "http://www.w3.org/1999/xhtml";

	/**
	 * XML serializer used for getting opening tags when keeping track of a nodes origin/call history.
	 */
	let _xmlSerializer = new XMLSerializer();

	/**
	 * Map of all loaded snippets.
	 * @type {Map<string, PageSnippetsMeta>}
	 */
	let snippets = new Map();

	/**
	 * From a snippet key or a path crumb array this retuns a normalized key string.
	 * @param {string|Array<string>} key Snippet name including its path, or an array with an item for each path crumb and the snippets name.
	 * @param {boolean} [asPath] Whether th returned value should be a path (`true`), then its trailied by a slash. Defalt is `false`.
	 * @returns {string} Returns the normalizes snippet key, indluding a leading slash and its full path.
	 * @example
	 * normalizeSnippetKey(["foo", "bar"])
	 * // returns "/foo/bar"
	 */
	function _normalizeSnippetKey (key, asPath = false)
	{
		if (key.constructor === Array)
		{
			key = key.join("/");
		}
		return ("/" + key + ((asPath === true) ? "/" : "")).replace(/\/+/g, "/");
	}

	/**
	 * Returns a listing of source document nodes that lead to this node including this node reference.
	 * @param {Element} node Source element that is currently processed.
	 * @param {string} source Filename and snippet name of the node.
	 * @param {string} origin Listing of source document nodes that lead to this node.
	 * @returns {string} Returns a listing of source document nodes that lead to this node including this node reference.
	 */
	function _updateCallHistory (node, source, origin)
	{
		let text = _xmlSerializer.serializeToString(node);
		return text.substring(0, text.indexOf(">") + 1)
			+ "\t@" + source
			+ "\n" + origin;
	}

	/**
	 * For logging purposes this manipulates the _origin_ string (which is a call history) whereas all "xmlns" attributes are being removed,
	 * so in the resulting string the XML tags are shorter and just like in the source document.
	 * @param {string} origin Call history string.
	 * @returns {string}
	 */
	function _originToString (origin)
	{
		return origin.replace(/\sxmlns(=|:[^=]+=)"[^"]+"/gi, "").trim();
	}

	/**
	 * Imports a PageSnippet file.
	 *
	 * This instantly adds the scripts and stylesheets referenced in the file to the current HTML document.
	 * You need to call `pageSnippets.produce()` to get a snippet node that can be placed on the page.
	 *
	 * @param {string} url URL of PageSnippets XML file to be loaded.
	 * @returns {Promise<void,Error>} Returns a void promise or rejects the promise with an error.
	 */
	this.import = function (url)
	{
		return new Promise((resolve, reject) =>
		{
			if (Array.from(snippets.values()).filter((v) => v.source === url).length > 0)
			{
				console.debug("PageSnippet \"" + url + "\" is already imported.");
				resolve();
			}
			else
			{
				fetch(url).then(
					(response) =>
					{
						//#region Private methods.
						/**
						 * Normalizes a relative path.
						 * @param {string} path Path to be normalized.
						 * @returns {string} Returns the normalized path.
						 */
						function _normalizePath (path)
						{
							let result = "";
							if (/^(http[s]?:\/\/|\/)/.test(path)) // Ignore absolute paths.
							{
								result = path;
							}
							else
							{
								let templateRoot = url.replace(/[^./]+\.[\S]+$/, ""); // Remove the file name from `url`, leaves the path only.
								path = path.replace(/^\.\//, ""); // Remove "./" at the beginning of `path`.
								result = templateRoot.concat(path).replace(/[^/]+\/\.\.\//g, ""); // Resolve parent directories ("../").
							}
							return result;
						}

						/**
						 * Parses a PageSnippets node. Iterates through all `<ps:snippet>` and `<ps:snippet-group>` nodes.
						 * Adds all referenced `<ps:stylesheet>`s to the HTML document via `_includeStypesheet()`.
						 * Writes all `<ps:script>`s to the HTML document via `_includeScripts()` which does finally resolve the _import()_ promise
						 * after all scripts have been loaded.
						 *
						 * Warns to console if unexpected or disallowed elements are encountered.
						 *
						 * @param {Element} node PageSnippet XML node to be parsed.
						 * @param {string} groupName _ps:snippet-group_ name where this node belongs to. Empty string if it is located at the root.
						 */
						function _parse (node, groupName, origin)
						{
							/** @type {Array<Element>} */
							let scriptsCollection = [];
							for (let childNode of node.children)
							{
								let location = _updateCallHistory(childNode, url, origin);
								if (childNode.namespaceURI === PS_NAMESPACE_URI)
								{
									if (childNode.localName === "snippet")
									{
										_appendSnippet(childNode, groupName, location);
									}
									else if (childNode.localName === "snippet-group")
									{
										let childGroupName = childNode.getAttribute("name");
										_parse(childNode, groupName + "/" + childGroupName, location);
									}
									else if ((groupName === "") && (childNode.localName === "stylesheet"))
									{
										_includeStylesheet(childNode, location);
									}
									else if ((groupName === "") && (childNode.localName === "script"))
									{
										scriptsCollection.push(childNode);
									}
									else
									{
										console.warn("Element not allowed here.\n" + _originToString(location));
									}
								}
								else
								{
									console.warn("Unexpected element.\n" + _originToString(location));
								}
							}
							if (groupName === "")
							{
								_includeScripts(scriptsCollection); // This does finally resolve.
							}
						}

						/**
						 * Appends a PageSnippet to the snippets collection.
						 * @param {Element} node PageSnippets node to be added to the snippets collection.
						 * @param {string} groupName _ps:snippet-group_ name where this node belongs to. Empty string if it is located at the root.
						 */
						function _appendSnippet (node, groupName, origin)
						{
							let snippetKey = groupName + "/" + node.getAttribute("name");
							snippets.set(snippetKey, {
								source: url,
								key: snippetKey,
								namespace: node.firstElementChild.namespaceURI || HTML_NAMESPACE_URI,
								data: node.firstElementChild
							});
							if (node.childElementCount > 1)
							{
								console.warn("Only one child element allowed.\n" + _originToString(origin));
							}
						}

						/**
						 * Includes a stylesheed given in a PageSnippet to the current HTML document.
						 *
						 * Avoids duplicate additions by checking if a stylesheet with a matching URL already exists in the document.
						 *
						 * @param {Element} node `<ps:stylesheet>` node to be included.
						 */
						function _includeStylesheet (node)
						{
							let src = _normalizePath(node.getAttribute("src"));
							if (document.querySelector("link[rel=\"stylesheet\"][href=\"" + src + "\"]") === null)
							{
								let styleNode = document.createElement("link");
								styleNode.setAttribute("rel", "stylesheet");
								styleNode.setAttribute("href", src);
								document.head.appendChild(styleNode);
							}
						}

						/**
						 * Includes all referenced scripts of a PageSnippet to the current HTML document.
						 *
						 * Avoids duplicate additions by checking if a script with a matching URL already exists in the document.
						 *
						 * **Resolves the _import()_ promise.**
						 *
						 * @param {Array<Element>} scriptsCollection Array of `<ps:script>` nodes from which to import scripts.
						 */
						function _includeScripts (scriptsCollection)
						{
							function __onScriptLoadend (loadEvent)
							{
								if (loadEvent.type === "error")
								{
									console.error("Error while loading \"" + loadEvent.target.src + "\"\n" + _originToString(_updateCallHistory(loadEvent.target, url, "")));
								}
								else
								{
									_includeScripts(scriptsCollection.slice(1));
								}
							}
							if (scriptsCollection.length > 0)
							{
								let scriptNode = scriptsCollection[0];
								let src = _normalizePath(scriptNode.getAttribute("src"));
								if (document.querySelector("script[src=\"" + src + "\"]") === null)
								{
									let scriptNode = document.createElement("script");
									scriptNode.addEventListener("load", __onScriptLoadend);
									scriptNode.addEventListener("error", __onScriptLoadend);
									scriptNode.setAttribute("src", src);
									document.head.appendChild(scriptNode);
								}
								else
								{
									_includeScripts(scriptsCollection.slice(1));
								}
							}
							else
							{
								resolve();
							}
						}
						//#endregion
						if (response.status === 200)
						{
							response.text().then((data) =>
							{
								/** @type {XMLDocument} */
								let xmlDocument;
								try
								{
									xmlDocument = new DOMParser().parseFromString(data, "text/xml");
								}
								finally
								{
									if ((xmlDocument.documentElement.namespaceURI === PS_NAMESPACE_URI) && (xmlDocument.documentElement.localName === "pagesnippets"))
									{
										_parse(xmlDocument.firstElementChild, "", ""); // This does finally resolve.
									}
									else
									{
										let error = new Error("\"" + url + "\" is not a PageSnippets XML-document.");
										console.error(error);
										reject(error);
									}
								}
							});
						}
						else
						{
							let error = new ReferenceError("Server returned " + response.status + " (" + response.statusText + ") when trying to fetch " + response.url);
							console.error(error);
							reject(error);
						}
					},
					(error) =>
					{
						console.log("FETCH ERROR");
						reject(new Error(error));
					});
			}
		});
	};

	/**
	 * Produces an actual HTML- or XML-element out of a page snippet.
	 * @param {string|Array<string>} snippetKey Key of snippet to be produced. This may be a single string (snippet name including its path), or an array with an item for each path crumb and the snippets name.
	 * @param {PageSnippetsProductionData} [data] Data needed to produce the snippet - values for placeholders, lists, event handler functions etc.
	 * @param {string} [_origin] _Resticted for internal use only._ Call history that lead to this production call.
	 * @returns {Element} Returns the element that was build out of the snippet using the given data.
	 */
	this.produce = function (snippetKey, data = {}, _origin = "")
	{
		const NODETYPE_ELEMENT = 1;
		const NODETYPE_TEXT = 3;
		function _getObjectValueByPath (object, path, pathSeparator = ".")
		{
			let result = undefined;
			if (!!object && !!path)
			{
				let steps = path.split(pathSeparator);
				result = (steps.length === 1) ? object[steps[0]] : _getObjectValueByPath(object[steps[0]], steps.splice(1).join(pathSeparator), pathSeparator);
			}
			return result;
		}

		/**
		 * Replaces all placehoders ("`{{value}}`") in a string by the respective values given in the production data.
		 *
		 * If there is no data for a placeholder, it is replaced by an empty string.
		 * @param {string} text String that may contain placeholders to be replaced.
		 * @param {PageSnippetsProductionData} data Production data from whitch to insert values.
		 * @returns {string} Returns the given string with placeholders replaced by values.
		 */
		function _resolveVariables (text, data)
		{
			let result = text;
			let rex = /\{\{(.*?)\}\}/g;
			let rexResult = rex.exec(text);
			while (!!rexResult)
			{
				let value = _getObjectValueByPath(data, rexResult[1]) ?? "";
				result = result.replace(rexResult[0], value);
				rexResult = rex.exec(text);
			}
			return result;
		}

		/**
		 * Processes the source node to build the content of the target element.
		 * @type {PageSnippetsProductionFunction}
		 */
		function _processNode (sourceNode, targetElement, data, origin)
		{
			for (let childSourceNode of sourceNode.childNodes)
			{
				switch (childSourceNode.nodeType)
				{
					case NODETYPE_ELEMENT:
						let location = _updateCallHistory(childSourceNode, currentSnippetSource, origin);
						if (childSourceNode.namespaceURI === PS_NAMESPACE_URI)
						{
							switch (childSourceNode.localName)
							{
								case "call-function":
									__psCallFunction(childSourceNode, targetElement, data, location);
									break;
								case "choose":
									__psChoose(childSourceNode, targetElement, data, location);
									break;
								case "for-each":
									__psForEach(childSourceNode, targetElement, data, location);
									break;
								case "for-empty":
									__psForEmpty(childSourceNode, targetElement, data, location);
									break;
								case "if":
									__psIf(childSourceNode, targetElement, data, location);
									break;
								case "insert-snippet":
									__psInsertSnippet(childSourceNode, targetElement, data, location);
									break;
								case "text":
									targetElement.appendChild(document.createTextNode(_resolveVariables(childSourceNode.firstChild.data, data)));
									break;
								default:
									console.warn("Element not allowed here.\n" + _originToString(location));
							}
						}
						else
						{
							let element = document.createElementNS(childSourceNode.namespaceURI || HTML_NAMESPACE_URI, childSourceNode.tagName);
							_addAttributes(childSourceNode, element, data, location);
							_processNode(childSourceNode, element, data, location);
							__psPostProduction(childSourceNode, element, data, location);
							targetElement.appendChild(element);
						}
						break;
					case NODETYPE_TEXT:
						if (/^\s*$/.test(childSourceNode.textContent) === false)
						{
							targetElement.appendChild(document.createTextNode(_resolveVariables(childSourceNode.textContent, data)));
						}
						break;
				}
			}
		}

		/**
		 * Processes the attributes of the source node, adds them to the target element or performs
		 * actions if they are PageSnippets attributes.
		 * @type {PageSnippetsProductionFunction}
		 */
		function _addAttributes (sourceNode, targetElement, data, origin)
		{
			for (let attribute of sourceNode.attributes)
			{
				if (attribute.namespaceURI === PS_NAMESPACE_URI)
				{
					if (/^on\S+/.test(attribute.localName))
					{
						let referencedFunction = _getObjectValueByPath(data, attribute.value);
						if (typeof referencedFunction === "function")
						{
							targetElement[attribute.localName] = referencedFunction;
						}
						else
						{
							console.warn("Event handler \"" + attribute.value + "\" is not a function.\n" + _originToString(origin));
						}
					}
					else if (attribute.localName !== "postproduction")
					{
						console.warn("Attribute \"" + attribute.name + "\" is not allowed here.\n" + _originToString(origin));
					}
				}
				else
				{
					targetElement.setAttributeNS(attribute.namespaceURI, attribute.localName, _resolveVariables(attribute.value, data));
				}
			}
		}

		//#region Node processing methods.
		/**
		 * Handles `ps:postproduction` attributes in snippet nodes.
		 * Tryies to call the named function given in the attribute.
		 * Removes the _ps:postproduction_ attribute from the target node.
		 *
		 * Throws a `ReferenceError` if the referenced object is not a function.
		 * @type {PageSnippetsProductionFunction}
		 */
		function __psPostProduction (sourceNode, targetElement, data, origin)
		{
			let postProductionFunction = sourceNode.getAttributeNS(PS_NAMESPACE_URI, "postproduction");
			if (postProductionFunction)
			{
				targetElement.removeAttributeNS(PS_NAMESPACE_URI, "postproduction");
				let referencedFunction = _getObjectValueByPath(data, postProductionFunction);
				if (typeof referencedFunction === "function")
				{
					referencedFunction(targetElement, data);
				}
				else
				{
					throw new ReferenceError("Post-production reference \"" + postProductionFunction + "\" is not a function.\n" + _originToString(origin));
				}
			}
		}

		/**
		 * Handles `<ps:call-function>` nodes.
		 * Tryies to call the named function given in the nodes _name_ attribute.
		 *
		 * Throws a `ReferenceError` if the referenced object is not a function.
		 * @type {PageSnippetsProductionFunction}
		 */
		function __psCallFunction (sourceNode, targetElement, data, origin)
		{
			let functionName = sourceNode.getAttributeNS(PS_NAMESPACE_URI, "name") || sourceNode.getAttribute("name");
			if (typeof data[functionName] === "function")
			{
				data[functionName](targetElement, data);
			}
			else
			{
				throw new ReferenceError("Reference to call \"" + functionName + "\" is not a function.\n" + _originToString(origin));
			}
		}

		/**
		 * Handles `<ps:for-each>` nodes.
		 * Iterates through the items of the array given in the _list_ attribute
		 * and for each item the child nodes are being processed.
		 *
		 * The array items get the properties `_position` (index of the item within the array, starting by 1)
		 * and `_count` (the array length).
		 *
		 * If the array item is a string, number or boolean, it is converted to an object
		 * with the original value stored in the `_value` property.
		 * @type {PageSnippetsProductionFunction}
		 */
		function __psForEach (sourceNode, targetElement, data, origin)
		{
			let listKey = sourceNode.getAttributeNS(PS_NAMESPACE_URI, "list") || sourceNode.getAttribute("list");
			let list = _getObjectValueByPath(data, listKey);
			if (list?.constructor === Array)
			{
				let position = 0;
				let itemsCount = list.length;
				for (let listItem of list)
				{
					let dataItem = ((["string", "number", "boolean"].includes(typeof listItem)) || (listItem.constructor === Array)) ? { "_value": listItem } : Object.assign({}, listItem);
					dataItem._position = position += 1;
					dataItem._count = itemsCount;
					_processNode(sourceNode, targetElement, Object.assign({}, data, dataItem), origin);
				}
			}
			else
			{
				throw new TypeError("\"" + listKey + "\" is " + (list?.constructor.name ?? "undefined") + ", expected Array.\n" + _originToString(origin));
			}
		}

		/**
		 * Handles `<ps:for-empty>` nodes.
		 * If the array given in the _list_ attribute is empty or no such object exists in the data,
		 * the child nodes are being processed.
		 * @type {PageSnippetsProductionFunction}
		 */
		function __psForEmpty (sourceNode, targetElement, data, origin)
		{
			let listKey = sourceNode.getAttributeNS(PS_NAMESPACE_URI, "list") || sourceNode.getAttribute("list");
			let list = _getObjectValueByPath(data, listKey);
			if ((list?.constructor !== Array) || (list.length === 0))
			{
				_processNode(sourceNode, targetElement, data, origin);
			}
		}

		/**
		 * Handles `<ps:choose>` nodes.
		 * @type {PageSnippetsProductionFunction}
		 */
		function __psChoose (sourceNode, targetElement, data, origin)
		{
			const CHOOSE_MODE_STRICT = "strict";
			const CHOOSE_MODE_LAX = "lax";
			let chooseMode = (RegExp("^" + CHOOSE_MODE_STRICT + "$|^" + CHOOSE_MODE_LAX + "$").exec((sourceNode.getAttribute("mode") || CHOOSE_MODE_STRICT)) || [""])[0];
			if (chooseMode === "")
			{
				console.warn("Invalid choose-mode \"" + sourceNode.getAttribute("mode") + "\", using \"strict\".\n" + _originToString(origin));
				chooseMode = CHOOSE_MODE_STRICT;
			}
			let anyMatch = false;
			for (let childSourceNode of sourceNode.children)
			{
				let location = _updateCallHistory(childSourceNode, currentSnippetSource, origin);
				if ((childSourceNode.namespaceURI === PS_NAMESPACE_URI) && (childSourceNode.localName === "if"))
				{
					let thisMatch = __psIf(childSourceNode, targetElement, data, location);
					anyMatch = anyMatch || thisMatch;
					if (anyMatch && (chooseMode === CHOOSE_MODE_STRICT))
					{
						break;
					}
				}
				else if ((childSourceNode.namespaceURI === PS_NAMESPACE_URI) && (childSourceNode.localName === "else"))
				{
					if (anyMatch === false)
					{
						_processNode(childSourceNode, targetElement, data, location);
					}
				}
				else
				{
					console.warn("Element not allowed here.\n" + _originToString(location));
				}
			}
		}

		/**
		 * Handles `<ps:if>` nodes. Creates a function from the nodes `test` expression and returns the functions result.
		 *
		 * If the test evaluates true, all child nodes within this node are bein produced.
		 *
		 * This is a `PageSnippetsProductionFunction`, but it returns a value.
		 * @param {Element} sourceNode Source that defined the element that is currently build.
		 * @param {Element} targetElement Currently processed target element.
		 * @param {PageSnippetsProductionData} data Data provided to build the target element.
		 * @param {string} origin Listing of source document nodes that lead to this function call.
		 * @returns {boolean} Result of the test expression validation.
		 */
		function __psIf (sourceNode, targetElement, data, origin)
		{
			let testExpression = sourceNode.getAttributeNS(PS_NAMESPACE_URI, "test") || sourceNode.getAttribute("test");
			let functionBody = "return (" + testExpression.replace(/'?\{\{/g, "this.").replace(/\}\}'?/g, "") + ")";
			let testResult;
			try
			{
				testResult = Function(functionBody).call(data);
			}
			catch (err)
			{
				throw new err.constructor("Cannot evaluate expression \"" + testExpression + "\": " + err.message + ".\n" + _originToString(origin));
			};
			if (testResult === true)
			{
				_processNode(sourceNode, targetElement, data, origin);
			}
			return testResult;
		}

		/**
		 * Handles `<ps:insert-snippet>` nodes. This calls `produce()` and insert the production result at the tags location.
		 * @type {PageSnippetsProductionFunction}
		 */
		function __psInsertSnippet (sourceNode, targetElement, data, origin)
		{
			let snippetPath = _normalizeSnippetKey(_resolveVariables(sourceNode.getAttributeNS(PS_NAMESPACE_URI, "name") || sourceNode.getAttribute("name"), data));
			if (snippets.has(snippetPath))
			{
				targetElement.appendChild(pageSnippets.produce(snippetPath, data, origin));
			}
			else
			{
				throw new ReferenceError("Unknown snippet \"" + snippetPath + "\".\n" + _originToString(origin));
			}
		}
		// #endregion

		if (["string", "undefined"].includes(typeof _origin) === false)
		{
			throw new TypeError("Prohibited usage of _parentSnippetRef");
		}
		let currentSnippetSource;
		snippetKey = _normalizeSnippetKey(snippetKey);
		if (this.getSnippet(snippetKey))
		{
			let snippet = snippets.get(snippetKey);
			if (_origin.includes(snippet.source + ":" + snippetKey))
			{
				throw new Error("Recursive snippet nesting.\n" + _originToString(_origin));
			}
			let origin = _updateCallHistory(snippet.data, snippet.source + ":" + snippetKey, _origin);
			let result = document.createElementNS(snippet.namespace, snippet.data.localName);
			currentSnippetSource = snippet.source + ":" + snippetKey;
			_addAttributes(snippet.data, result, data, origin);
			_processNode(snippet.data, result, data, origin);
			__psPostProduction(snippet.data, result, data, origin);
			return result;
		}
	};

	/**
	 * Returns a boolean of whether a certain snippet does exist or not.
	 * @param {string|Array<string>} snippetKey Key of desired snippet. This may be a single string (snippet name including its path), or an array with an item for each path crumb and the snippets name.
	 * @returns {boolean} `true` if a snippet with the given key exists, otherwise `false`.
	 */
	this.hasSnippet = function (snippetKey)
	{
		return snippets.has(snippetKey);
	};

	/**
	 * Provides data of a snippet.
	 * @param {string|Array<string>} snippetKey Key of desired snippet. This may be a single string (snippet name including its path), or an array with an item for each path crumb and the snippets name.
	 * @returns {PageSnippetsMeta|null} Meta data of the requested snippet.
	 */
	this.getSnippet = function (snippetKey)
	{
		if (snippets.has(snippetKey))
		{
			return snippets.get(_normalizeSnippetKey(snippetKey));
		}
		else
		{
			throw new ReferenceError("No such snippet: \"" + snippetKey + "\".");
		}
	};

	/**
	 * Provides a list of all snippets within a snippet group.
	 * @param {string|Array<string>} [path] Path of snippet group from which to get its snippets.
	 * @param {boolean} [recursive] Whether to get snippets from all sub groups within that group.
	 * @returns {Array<string>} Fully qualified keys of all snippets within the given group.
	 */
	this.getSnippets = function (path = "", recursive = false)
	{
		let result = [];
		let filterRex = new RegExp("^(" + _normalizeSnippetKey(path, true) + "[^/]+)$");
		path = _normalizeSnippetKey(path, true);
		result = result.concat(Array.from(snippets.keys()).filter((v) => filterRex.test(v)));
		if (recursive === true)
		{
			for (let subgroup of this.getSnippetGroups(path))
			{
				result = result.concat(this.getSnippets(subgroup, true));
			}
		}
		return result;
	};

	/**
	 * Provides a list of all sub groups within a snippet group.
	 * @param {string} [path] Snippet group from which to get sub-groups.
	 * @param {boolean} [recursive] Whether to also get groups from all sub groups.
	 * @returns {Array<string>} Paths of snippet groups within the requested group.
	 */
	this.getSnippetGroups = function (path = "", recursive = false)
	{
		let filterRex = new RegExp("^(" + _normalizeSnippetKey(path, true) + "[^/]+/)");
		let resultSet = new Set();
		for (let key of snippets.keys())
		{
			let rm = filterRex.exec(key);
			if (rm)
			{
				if (resultSet.has(rm[1]) === false)
				{
					resultSet.add(rm[1]);
					if (recursive === true)
					{
						this.getSnippetGroups(rm[1], recursive).forEach((v) => resultSet.add(v));
					}
				}
			}
		}
		return Array.from(resultSet);
	};
};
