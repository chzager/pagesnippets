/**
 * PageSnippets - dynamically load and produce HTML or XML.
 * @version 2.3.1
 * @copyright (c) 2023 Christoph Zager
 * @license Apache-2.0 - See the full license text at http://www.apache.org/licenses/LICENSE-2.0
 * @link https://github.com/chzager/pagesnippets
 */
const pageSnippets = new function ()
{
	/**
	 * PageSnippets XML scheme namespace URI.
	 */
	const PS_NAMESPACE_URI = "https://github.com/chzager/pagesnippets";

	/**
	 * HTML namespace URI.
	 */
	const HTML_NAMESPACE_URI = "http://www.w3.org/1999/xhtml";

	/**
	 * XML serializer used for getting opening tags when keeping track of a nodes origin/call history.
	 */
	const _xmlSerializer = new XMLSerializer();

	/**
	 * Map of all loaded snippets.
	 * @type {Map<string, PageSnippetsMeta>}
	 */
	const snippets = new Map();

	/**
	 * From a snippet key or a path crumb array this retuns a normalized key string.
	 * @param {string|Array<string>} key Snippet name including its path, or an array with an item for each path crumb and the snippets name.
	 * @param {boolean} [asPath] Whether th returned value should be a path (`true`), then its trailied by a slash. Defalt is `false`.
	 * @returns {string} The normalized snippet key, indluding a leading slash and its full path.
	 * @example
	 * normalizeSnippetKey(["foo", "bar"])
	 * // returns "/foo/bar"
	 */
	function normalizeSnippetKey (key, asPath = false)
	{
		if (Array.isArray(key))
		{
			key = key.join("/");
		}
		return ("/" + key + ((asPath === true) ? "/" : "")).replace(/\/+/g, "/");
	}

	/**
	 * Returns a list of source document nodes that lead to this node including this node reference.
	 * @param {Element} node Source element that is currently processed.
	 * @param {string} source Filename and snippet name of the node.
	 * @param {string} origin List of source document nodes that lead to this node.
	 * @returns {string} A list of source document nodes that lead to this node including this node reference.
	 */
	function updateCallHistory (node, source, origin)
	{
		const text = _xmlSerializer.serializeToString(node);
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
	function originToString (origin)
	{
		return origin.replace(/\sxmlns(=|:[^=]+=)"[^"]+"/gi, "").trim();
	}

	/**
	 * The locale to be used when formatting numbers and dates in `<ps:text>` nodes.
	 * Default: `"default"`.
	 * @type {Intl.LocalesArgument}
	 */
	this.locale = "default";

	/**
	 * Imports a PageSnippet file.
	 *
	 * This instantly adds the scripts and stylesheets referenced in the file to the current HTML document.
	 * You need to call {@linkcode pageSnippets.produce()} to get a snippet node that can be placed on the page.
	 *
	 * @param {string} url URL of PageSnippets XML file to be loaded.
	 * @param {HeadersInit} [headers] Custom headers to pass along with the request.
	 * @returns {Promise<void>} A `Promise` that resolves after the PageSnippet and all it's referenced files are loaded, or rejects with an error.
	 */
	this.import = function (url, headers)
	{
		return new Promise((resolve, reject) =>
		{
			if (Array.from(snippets.values()).some(v => v.source === url))
			{
				console.debug(`PageSnippet "${url}" is already imported.`);
				resolve();
			}
			else
			{
				fetch(url, { headers: headers })
					.then(response =>
					{
						//#region Private methods.
						/**
						 * Normalizes a relative path.
						 * @param {string} path Path to be normalized.
						 * @returns {string} Returns the normalized path.
						 */
						function normalizePath (path)
						{
							let result = "";
							if (/^(http[s]?:\/\/|\/)/.test(path)) // Ignore absolute paths.
							{
								result = path;
							}
							else
							{
								const templateRoot = url.substring(0, url.lastIndexOf("\/") + 1); // Remove the file name from `url`, leaves the path only.
								path = path.replace(/^\.\//, ""); // Remove "./" at the beginning of `path`.
								result = templateRoot.concat(path).replace(/[^/]+\/\.\.\//g, ""); // Resolve parent directories ("../").
							}
							return result;
						}

						/**
						 * Parses a PageSnippets node. Iterates through all `<ps:snippet>` and `<ps:snippet-group>` nodes.
						 * Adds all referenced `<ps:stylesheet>`s to the HTML document via `includeStypesheet()`.
						 * Writes all `<ps:script>`s to the HTML document via `includeScripts()` which does finally resolve the _import()_ promise
						 * after all scripts have been loaded.
						 *
						 * Warns to console if unexpected or disallowed elements are encountered.
						 *
						 * @param {Element} node PageSnippet XML node to be parsed.
						 * @param {string} groupName _ps:snippet-group_ name where this node belongs to. Empty string if it is located at the root.
						 */
						function parse (node, groupName, origin)
						{
							/** @type {Array<Element>} */
							const scriptsCollection = [];
							for (const childNode of node.children)
							{
								const location = updateCallHistory(childNode, url, origin);
								if (childNode.namespaceURI === PS_NAMESPACE_URI)
								{
									switch (childNode.localName)
									{
										case "snippet":
											appendSnippet(childNode, groupName, location);
											break;
										case "snippet-group":
											const childGroupName = childNode.getAttribute("name");
											parse(childNode, groupName + "/" + childGroupName, location);
											break;
										case "stylesheet":
											includeStylesheet(childNode);
											break;
										case "script":
											scriptsCollection.push(childNode);
											break;
									}
								}
							}
							if (groupName === "")
							{
								includeScripts(scriptsCollection); // This does finally resolve.
							}
						}

						/**
						 * Appends a PageSnippet to the snippets collection.
						 * @param {Element} node PageSnippets node to be added to the snippets collection.
						 * @param {string} groupName _ps:snippet-group_ name where this node belongs to. Empty string if it is located at the root.
						 */
						function appendSnippet (node, groupName, origin)
						{
							const snippetKey = groupName + "/" + node.getAttribute("name");
							snippets.set(snippetKey, {
								source: url,
								key: snippetKey,
								namespace: node.firstElementChild.namespaceURI || HTML_NAMESPACE_URI,
								data: node.firstElementChild
							});
						}

						/**
						 * Includes a stylesheed given in a PageSnippet to the current HTML document.
						 *
						 * Avoids duplicate additions by checking if a stylesheet with a matching URL already exists in the document.
						 *
						 * @param {Element} node `<ps:stylesheet>` node to be included.
						 */
						function includeStylesheet (node)
						{
							const src = normalizePath(node.getAttribute("src"));
							if (document.querySelector("link[rel=\"stylesheet\"][href=\"" + src + "\"]") === null)
							{
								const styleNode = document.createElement("link");
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
						function includeScripts (scriptsCollection)
						{
							function onScriptLoadend (loadEvent)
							{
								if (loadEvent.type === "error")
								{
									console.error("Error while loading \"" + loadEvent.target.src + "\"\n" + originToString(updateCallHistory(loadEvent.target, url, "")));
								}
								else
								{
									includeScripts(scriptsCollection.slice(1));
								}
							}
							if (scriptsCollection.length > 0)
							{
								const scriptNode = scriptsCollection[0];
								const src = normalizePath(scriptNode.getAttribute("src"));
								if (document.querySelector("script[src=\"" + src + "\"]") === null)
								{
									const scriptNode = document.createElement("script");
									scriptNode.addEventListener("load", onScriptLoadend);
									scriptNode.addEventListener("error", onScriptLoadend);
									scriptNode.setAttribute("src", src);
									document.head.appendChild(scriptNode);
								}
								else
								{
									includeScripts(scriptsCollection.slice(1));
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
							response.text()
								.then(data =>
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
											parse(xmlDocument.firstElementChild, "", ""); // This does finally resolve.
										}
										else
										{
											const error = new Error(`"${url}" is not a PageSnippets XML-document.`);
											console.error(error);
											reject(error);
										}
									}
								});
						}
						else
						{
							const error = new ReferenceError(`Server returned ${response.status} (${response.statusText}) when trying to fetch ${response.url}`);
							console.error(error);
							reject(error);
						}
					},
						(error) =>
						{
							console.log("FETCH ERROR");
							reject(error);
						});
			}
		});
	};

	/**
	 * Produces an actual HTML- or XML-element from a page snippet.
	 * @param {string|Array<string>} snippetKey Key of snippet to be produced. This may be a single string (snippet name including its path), or an array with an item for each path crumb and the snippets name.
	 * @param {PageSnippetsProductionData} [data] Data needed to produce the snippet: values for placeholders, lists, event handler functions etc.
	 * @param {string} [_origin] _Resticted for internal use only._ Call history that lead to this production call.
	 * @returns {Element} The element that was build from the snippet using the given data.
	 */
	this.produce = function (snippetKey, data = {}, _origin = "")
	{
		const NODETYPE_ELEMENT = 1;
		const NODETYPE_TEXT = 3;

		/** Some attributes need to be set as the element object's property. This is the list of affected tags and attributes. */
		const PROPERTY_ATTRIBUTES = new Map(Object.entries({
			"INPUT": ["value"],
			"SELECT": ["value"],
		}));

		function getObjectValueByPath (object, path, pathSeparator = ".")
		{
			let result = undefined;
			if (!!object && !!path)
			{
				const steps = path.split(pathSeparator);
				result = (steps.length === 1) ? object[steps[0]] : getObjectValueByPath(object[steps[0]], steps.splice(1).join(pathSeparator), pathSeparator);
			}
			return result;
		}

		/**
		 * Replaces all placeholders ("`{{key}}`") in a string by the respective values given in the production data.
		 *
		 * If there is no data for a placeholder, it is replaced by an empty string.
		 * @param {string} text String that may contain placeholders to be replaced.
		 * @param {PageSnippetsProductionData} data Production data from whitch to insert values.
		 * @param {Element} [sourceNode] The snippets source node that does contain the variables (for `number-format` and `date-format` attributes).
		 * @returns {string} The given string with placeholders replaced by values.
		 */
		function resolveVariables (text, data, sourceNode)
		{
			let result = text;
			for (const [str, key] of text.matchAll(/\{\{(.*?)\}\}/g))
			{
				const value = getObjectValueByPath(data, key) ?? "";
				if (typeof value === "number")
				{
					const numberFormat = sourceNode?.attributes.getNamedItem("number-format")?.value;
					if (!!numberFormat)
					{
						const decimalsFormat = /^\+?[^.]+/.exec(numberFormat)?.[0] ?? "0";
						const fractionFormat = /\.(.*)$/.exec(numberFormat)?.[1] ?? "";
						const minimumFractionDigits = Math.max(fractionFormat.replace(/[^0]/g, "").length, 0);
						const numStr = value.toLocaleString(undefined, {
							roundingPriority: "lessPrecision",
							roundingMode: "trunc",
							useGrouping: numberFormat.includes(","),
							signDisplay: (numberFormat.includes("+")) ? "always" : "auto",
							trailingZeroDisplay: (/\.#/.test(numberFormat)) ? "stripIfInteger" : "auto",
							minimumIntegerDigits: Math.max(decimalsFormat.replace(/[^0]/g, "").length, 1),
							minimumFractionDigits: minimumFractionDigits,
							maximumFractionDigits: Math.max(fractionFormat.length, minimumFractionDigits)
						});
						result = result.replace(str, numStr);
					}
					else
					{
						result = result.replace(str, value.toString());
					}
				}
				else if (value instanceof Date)
				{
					let dateStr = sourceNode?.attributes.getNamedItem("date-format")?.value;
					if (!!dateStr)
					{
						for (const [regxMatch] of dateStr.matchAll(/D{1,4}|d{1,2}|M{1,4}|m{1,2}|y{4}|y{2}|h{1,2}|n{2}|s{2}/g))
						{
							const tag = regxMatch;
							const numChars = tag.length;
							let val = "";
							switch (tag)
							{
								case "d":
								case "dd":
									val = value.getDate().toString();
									break;
								case "D":
								case "DD":
								case "DDD":
								case "DDDD":
									val = value.toLocaleDateString(pageSnippets.locale, { weekday: "long" });
									if (numChars < 4)
									{
										val = val.substring(0, numChars);
									}
									break;
								case "m":
								case "mm":
									val = (value.getMonth() + 1).toString();
									break;
								case "M":
								case "MM":
								case "MMM":
								case "MMMM":
									val = value.toLocaleDateString(pageSnippets.locale, { month: "long" });
									if (numChars < 4)
									{
										val = val.substring(0, numChars);
									}
									break;
								case "yy":
									val = value.getFullYear().toString().substring(2, 4);
									break;
								case "yyyy":
									val = value.getFullYear().toString();
									break;
								case "h":
								case "hh":
									val = value.getHours().toString();
									break;
								case "nn":
									val = value.getMinutes().toString();
									break;
								case "ss":
									val = value.getSeconds().toString();
									break;
								default:
									val = "";
							}
							dateStr = dateStr.replace(tag, val.padStart(numChars, "0"));
						}
						result = result.replace(str, dateStr);
					}
					else
					{
						result = result.replace(str, value.toJSON());
					}
				}
				else
				{
					result = result.replace(str, value.toString());
				}
			}
			return result;
		}

		/**
		 * Processes the source node to build the content of the target element.
		 * @type {PageSnippetsProductionFunction}
		 */
		function processNode (sourceNode, targetElement, data, origin)
		{
			for (const childSourceNode of sourceNode.childNodes)
			{
				switch (childSourceNode.nodeType)
				{
					case NODETYPE_ELEMENT:
						const location = updateCallHistory(childSourceNode, currentSnippetSource, origin);
						if (childSourceNode.namespaceURI === PS_NAMESPACE_URI)
						{
							switch (childSourceNode.localName)
							{
								case "call-function":
									psCallFunction(childSourceNode, targetElement, data, location);
									break;
								case "choose":
									psChoose(childSourceNode, targetElement, data, location);
									break;
								case "for-each":
									psForEach(childSourceNode, targetElement, data, location);
									break;
								case "for-empty":
									psForEmpty(childSourceNode, targetElement, data, location);
									break;
								case "if":
									psIf(childSourceNode, targetElement, data, location);
									break;
								case "insert-snippet":
									psInsertSnippet(childSourceNode, targetElement, data, location);
									break;
								case "text":
									targetElement.appendChild(document.createTextNode(resolveVariables(childSourceNode.firstChild.data, data, childSourceNode)));
									break;
								default:
									console.warn("Element not allowed here.\n" + originToString(location));
							}
						}
						else
						{
							const element = document.createElementNS(childSourceNode.namespaceURI || HTML_NAMESPACE_URI, childSourceNode.tagName);
							addAttributes(childSourceNode, element, data, location);
							processNode(childSourceNode, element, data, location);
							psPostProduction(childSourceNode, element, data, location);
							targetElement.appendChild(element);
							const propertyAttributes = PROPERTY_ATTRIBUTES.get(element.tagName);
							for (const propertyAttribute of propertyAttributes ?? [])
							{
								if (element.hasAttribute(propertyAttribute))
								{
									element[propertyAttribute] = element.getAttribute(propertyAttribute);
									element.removeAttribute(propertyAttribute);
								}
							}
						}
						break;
					case NODETYPE_TEXT:
						if (/^\s*$/.test(childSourceNode.textContent) === false)
						{
							targetElement.appendChild(document.createTextNode(resolveVariables(childSourceNode.textContent, data, childSourceNode.parentElement)));
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
		function addAttributes (sourceNode, targetElement, data, origin)
		{
			for (const attribute of sourceNode.attributes)
			{
				if (attribute.namespaceURI === PS_NAMESPACE_URI)
				{
					if (attribute.localName.startsWith("on"))
					{
						const referencedFunction = getObjectValueByPath(data, attribute.value);
						if (typeof referencedFunction === "function")
						{
							targetElement[attribute.localName] = referencedFunction;
						}
						else
						{
							console.warn(`Event handler "${attribute.value}" is not a function.\n` + originToString(origin));
						}
					}
				}
				else
				{
					targetElement.setAttributeNS(attribute.namespaceURI, attribute.localName, resolveVariables(attribute.value, data));
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
		function psPostProduction (sourceNode, targetElement, data, origin)
		{
			const postProductionFunction = sourceNode.getAttributeNS(PS_NAMESPACE_URI, "postproduction");
			if (postProductionFunction)
			{
				targetElement.removeAttributeNS(PS_NAMESPACE_URI, "postproduction");
				const referencedFunction = getObjectValueByPath(data, postProductionFunction);
				if (typeof referencedFunction === "function")
				{
					referencedFunction(targetElement, data);
				}
				else
				{
					throw new ReferenceError(`Post-production reference "${postProductionFunction}" is not a function.\n` + originToString(origin));
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
		function psCallFunction (sourceNode, targetElement, data, origin)
		{
			const functionName = sourceNode.getAttributeNS(PS_NAMESPACE_URI, "name") || sourceNode.getAttribute("name");
			if (typeof data[functionName] === "function")
			{
				const args = [];
				for (const child of sourceNode.children)
				{
					if ((child.namespaceURI === PS_NAMESPACE_URI) && (child.localName === "argument"))
					{
						args.push(resolveVariables(child.getAttribute("value"), data));
					}
				}
				data[functionName](targetElement, data, ...args);
			}
			else
			{
				throw new ReferenceError(`Reference to call "${functionName}" is not a function.\n` + originToString(origin));
			}
		}

		/**
		 * Handles `<ps:for-each>` nodes.
		 * Iterates through the items of the array given in the _list_ attribute
		 * and for each item the child nodes are being processed.
		 *
		 * The array items get the properties `_index`, `_position` (index of the item within the array, starting by 1) and `_count` (the array length).
		 *
		 * If the array item is a primitive type (string, number or boolean), it is converted to an object with the original value stored
		 * in the `_value` property.
		 * @type {PageSnippetsProductionFunction}
		 */
		function psForEach (sourceNode, targetElement, data, origin)
		{
			function ObjectAssignEx (target, ...sources)
			{
				for (const source of sources)
				{
					Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
					const proto = Object.getPrototypeOf(source);
					if (proto && (proto !== Object.prototype))
					{
						for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto)))
						{
							if (("get" in descriptor) || ("set" in descriptor))
							{
								Object.defineProperty(target, key, descriptor);
							}
						}
					}
				}
				return target;
			}
			const listKey = sourceNode.getAttributeNS(PS_NAMESPACE_URI, "list") || sourceNode.getAttribute("list");
			const list = getObjectValueByPath(data, listKey);
			if (Array.isArray(list))
			{
				let index = 0;
				const itemsCount = list.length;
				for (const listItem of list)
				{
					const dataItem = (["string", "number", "boolean"].includes(typeof listItem) || Array.isArray(listItem)) ? { _value: listItem } : listItem;
					processNode(sourceNode, targetElement, ObjectAssignEx({}, data, dataItem, {
						_index: index,
						_position: index + 1,
						_count: itemsCount,
					}), origin);
					index += 1;
				}
			}
			else
			{
				throw new TypeError(`"${listKey}" is ${(list?.constructor.name ?? "undefined")}, expected Array.\n` + originToString(origin));
			}
		}

		/**
		 * Handles `<ps:for-empty>` nodes.
		 * If the array given in the _list_ attribute is empty or no such object exists in the data,
		 * the child nodes are being processed.
		 * @type {PageSnippetsProductionFunction}
		 */
		function psForEmpty (sourceNode, targetElement, data, origin)
		{
			const listKey = sourceNode.getAttributeNS(PS_NAMESPACE_URI, "list") || sourceNode.getAttribute("list");
			const list = getObjectValueByPath(data, listKey);
			if (Array.isArray(list) || (list.length === 0))
			{
				processNode(sourceNode, targetElement, data, origin);
			}
		}

		/**
		 * Handles `<ps:choose>` nodes.
		 * @type {PageSnippetsProductionFunction}
		 */
		function psChoose (sourceNode, targetElement, data, origin)
		{
			const CHOOSE_MODE_STRICT = "strict";
			const CHOOSE_MODE_LAX = "lax";
			let chooseMode = (RegExp("^" + CHOOSE_MODE_STRICT + "$|^" + CHOOSE_MODE_LAX + "$").exec((sourceNode.getAttribute("mode") || CHOOSE_MODE_STRICT)) || [""])[0];
			if (chooseMode === "")
			{
				console.warn(`Invalid choose-mode "${sourceNode.getAttribute("mode")}", using "strict".\n` + originToString(origin));
				chooseMode = CHOOSE_MODE_STRICT;
			}
			let anyMatch = false;
			for (const childSourceNode of sourceNode.children)
			{
				const location = updateCallHistory(childSourceNode, currentSnippetSource, origin);
				if ((childSourceNode.namespaceURI === PS_NAMESPACE_URI) && (childSourceNode.localName === "if"))
				{
					const thisMatch = psIf(childSourceNode, targetElement, data, location);
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
						processNode(childSourceNode, targetElement, data, location);
					}
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
		 * @param {string} origin List of source document nodes that lead to this function call.
		 * @returns {boolean} Result of the test expression validation.
		 */
		function psIf (sourceNode, targetElement, data, origin)
		{
			const testExpression = sourceNode.getAttributeNS(PS_NAMESPACE_URI, "test") || sourceNode.getAttribute("test");
			const functionBody = "return (" + testExpression.replace(/'?\{\{/g, "this.").replace(/\}\}'?/g, "") + ")";
			let testResult;
			try
			{
				testResult = Function(functionBody).call(data);
			}
			catch (err)
			{
				throw new err.constructor(`Cannot evaluate expression "${testExpression}": ${err.message}.\n` + originToString(origin));
			};
			if (testResult === true)
			{
				processNode(sourceNode, targetElement, data, origin);
			}
			return testResult;
		}

		/**
		 * Handles `<ps:insert-snippet>` nodes. This calls `produce()` and insert the production result at the tags location.
		 * @type {PageSnippetsProductionFunction}
		 */
		function psInsertSnippet (sourceNode, targetElement, data, origin)
		{
			const snippetPath = normalizeSnippetKey(resolveVariables(sourceNode.getAttributeNS(PS_NAMESPACE_URI, "name") || sourceNode.getAttribute("name"), data));
			if (snippets.has(snippetPath))
			{
				for (const child of sourceNode.children)
				{
					if ((child.namespaceURI === PS_NAMESPACE_URI) && (child.localName === "param"))
					{
						data[child.getAttribute("name")] = resolveVariables(child.getAttribute("value"), data);
					}
				}
				targetElement.appendChild(pageSnippets.produce(snippetPath, data, origin));
			}
			else
			{
				throw new ReferenceError(`Unknown snippet "${snippetPath}".\n` + originToString(origin));
			}
		}
		// #endregion

		if (["string", "undefined"].includes(typeof _origin) === false)
		{
			throw new TypeError("Prohibited usage of _parentSnippetRef");
		}
		let currentSnippetSource;
		snippetKey = normalizeSnippetKey(snippetKey);
		if (this.getSnippet(snippetKey))
		{
			const snippet = snippets.get(snippetKey);
			if (_origin.includes(snippet.source + ":" + snippetKey))
			{
				throw new Error("Recursive snippet nesting.\n" + originToString(_origin));
			}
			const origin = updateCallHistory(snippet.data, snippet.source + ":" + snippetKey, _origin);
			const result = document.createElementNS(snippet.namespace, snippet.data.localName);
			currentSnippetSource = snippet.source + ":" + snippetKey;
			addAttributes(snippet.data, result, data, origin);
			processNode(snippet.data, result, data, origin);
			psPostProduction(snippet.data, result, data, origin);
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
			return snippets.get(normalizeSnippetKey(snippetKey));
		}
		else
		{
			throw new ReferenceError(`No such snippet: "${snippetKey}".`);
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
		path = normalizeSnippetKey(path, true);
		const filterRex = new RegExp("^(" + normalizeSnippetKey(path, true) + "[^/]+)$");
		const result = Array.from(snippets.keys()).filter(v => filterRex.test(v));
		if (recursive)
		{
			for (const subgroup of this.getSnippetGroups(path))
			{
				result.push(...this.getSnippets(subgroup, true));
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
		const filterRex = new RegExp("^(" + normalizeSnippetKey(path, true) + "[^/]+/)");
		const resultSet = new Set();
		for (let key of snippets.keys())
		{
			const rm = filterRex.exec(key);
			if (rm)
			{
				if (resultSet.has(rm[1]) === false)
				{
					resultSet.add(rm[1]);
					if (recursive === true)
					{
						this.getSnippetGroups(rm[1], recursive).forEach(v => resultSet.add(v));
					}
				}
			}
		}
		return Array.from(resultSet);
	};
};
