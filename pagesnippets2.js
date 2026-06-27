/// <reference path="./pagesnippets2.d.ts" />
/**
 * PageSnippets - dynamically load and generate HTML or XML.
 * @version 2.3.1
 * @copyright (c) 2023 Christoph Zager
 * @license Apache-2.0 - See the full license text at http://www.apache.org/licenses/LICENSE-2.0
 * @link https://github.com/chzager/pagesnippets
 */
const pageSnippets = new class pageSnippets
{
	/**
	 * PageSnippets XML scheme namespace URI.
	 */
	static PS_NAMESPACE_URI = "https://github.com/chzager/pagesnippets";

	/**
	 * HTML namespace URI.
	 */
	static HTML_NAMESPACE_URI = "http://www.w3.org/1999/xhtml";

	/**
	 * Map of all loaded snippets.
	 * @type {Map<string,PageSnippets.Meta>}
	 */
	#snippets = new Map();

	/**
	 * From a snippet key or a path crumb array this returns a normalized key string.
	 * @param {string|Array<string>} key Snippet name including its path, or an array with an item for each path crumb and the snippets name.
	 * @returns The normalized snippet key, including a leading slash and its full path.
	 * @example
	 * normalizeSnippetKey(["foo", "bar"])
	 * // returns "/foo/bar"
	 */
	#normalizeSnippetKey (key)
	{
		if (Array.isArray(key))
		{
			// TODO: Remove using arrays as snippet keys or paths at the end of 2026.
			console.warn("Usage of arrays as snippet keys or paths is deprecated and will be discontinued at the end of 2026.");
			key = key.join("/");
		}
		if (!key.startsWith("/"))
		{
			console.trace(`Snippet keys should be notated as absolute paths, starting with a slash ('/'). You said "${key}".`);
		}
		return ("/" + key).replace(/\/+/g, "/");
	}

	/**
	 * Returns a list of source document nodes that lead to this node including this node reference.
	 * @param {Element} node Source element that is currently processed.
	 * @param {string} source Filename and snippet name of the node.
	 * @param {string} trace List of source document nodes that lead to this node.
	 * @returns A list of source document nodes that lead to this node including this node reference.
	 */
	#updateCallHistory (node, source, trace)
	{
		let nodeAsString = node.nodeName;
		for (const att of node.attributes)
		{
			nodeAsString += " " + `${att.name}="${att.value}"`;
		}
		return trace + "\n"
			+ `<${nodeAsString}>`
			+ "\t@" + source;
	}

	/**
	 * For logging purposes, this manipulates the _trace_ string (which is a call history) whereas all "xmlns" attributes are being removed,
	 * so in the resulting string the XML tags are shorter and just like in the source document.
	 * @param {string} trace Call history string.
	 */
	#traceToString (trace)
	{
		return trace.replace(/\sxmlns(=|:[^=]+=)"[^"]+"/gi, "").trim();
	}

	/**
	 * Imports a PageSnippet file.
	 *
	 * This instantly adds the scripts and stylesheets referenced in the file to the current HTML document.
	 * You need to call {@linkcode pageSnippets.produce()} to get an element that can be added to the DOM.
	 *
	 * @param {string} url URL of PageSnippets XML file to be loaded.
	 * @param {HeadersInit} [headers] Custom headers to pass along with the request.
	 * @returns A `Promise` that resolves after the PageSnippet and all its referenced files are loaded, or rejects with an error.
	 */
	async import (url, headers)
	{
		/**
		 * Returns the normalized path.
		 * @param {string} path Path to be normalized.
		 */
		const normalizePath = (path) =>
		{
			if (/^(http[s]?:\/\/|\/)/.test(path)) // Ignore absolute paths.
			{
				return path;
			}
			else
			{
				const templateRoot = url.substring(0, url.lastIndexOf("\/") + 1); // Remove the file name from `url`, leaves the path only.
				path = path.replace(/^\.\//, ""); // Remove "./" at the beginning of `path`.
				return templateRoot.concat(path).replace(/[^/]+\/\.\.\//g, ""); // Resolve parent directories ("../").
			}
		};
		/**
		 * Parses a PageSnippets node. Iterates through all `<ps:snippet>` and `<ps:snippet-group>` nodes.
		 * Adds all referenced `<ps:stylesheet>`s and `<ps:script>`s to the HTML document.
		 *
		 * Warns to console if unexpected or disallowed elements are encountered.
		 *
		 * @param {Element} node PageSnippet XML node to be parsed.
		 * @param {string} groupName _ps:snippet-group_ name where this node belongs to. Empty string if it is located at the root.
		 * @param {string} origin Call history that lead to the node that is about to be parsed.
		 */
		const parse = async (node, groupName, origin) =>
		{
			for (const childNode of node.children)
			{
				if (childNode.namespaceURI === pageSnippets.PS_NAMESPACE_URI)
				{
					switch (childNode.localName)
					{
						case "snippet":
							{
								const snippetKey = `${groupName}/${childNode.getAttribute("name")}`;
								this.#snippets.set(snippetKey, {
									source: url,
									key: snippetKey,
									namespace: childNode.firstElementChild.namespaceURI || pageSnippets.HTML_NAMESPACE_URI,
									data: childNode.firstElementChild
								});
							}
							break;
						case "snippet-group":
							const childGroupName = childNode.getAttribute("name");
							const location = this.#updateCallHistory(childNode, url, origin);
							await parse(childNode, `${groupName}/${childGroupName}`, location);
							break;
						case "stylesheet":
							const stylesheetSrc = normalizePath(childNode.getAttribute("src"));
							if (!document.querySelector(`link[rel="stylesheet"][href="${stylesheetSrc}"]`))
							{
								const styleNode = document.createElement("link");
								styleNode.setAttribute("rel", "stylesheet");
								styleNode.setAttribute("href", stylesheetSrc);
								document.head.appendChild(styleNode);
							}
							break;
					}
				}
			}
			// `<ps:script>` nodes are always loaded last.
			if (groupName === "")
			{
				for (const scriptNode of node.getElementsByTagNameNS(pageSnippets.PS_NAMESPACE_URI, "script"))
				{
					const scriptSrc = normalizePath(scriptNode.getAttribute("src"));
					if (!document.querySelector(`script[src="${scriptSrc}"]`))
					{
						await new Promise((resolve, reject) =>
						{
							const scriptElement = document.createElement("script");
							scriptElement.addEventListener("load", () => resolve());
							scriptElement.addEventListener("error", (event) =>
							{
								console.error(`Error while loading "${scriptSrc}"\n${this.#traceToString(this.#updateCallHistory(event.target, url, ""))}`);
								reject(new Error(`Failed to load script: ${scriptSrc}`));
							});
							scriptElement.setAttribute("src", scriptSrc);
							document.head.appendChild(scriptElement);
						});
					}
				}
			}
		};
		if (Array.from(this.#snippets.values()).some(v => v.source === url))
		{
			console.debug(`PageSnippet "${url}" is already imported.`);
			return;
		}
		else
		{
			const response = await fetch(url, { headers: headers });
			if (response.status !== 200)
			{
				throw new ReferenceError(`Server returned ${response.status} (${response.statusText}) when trying to fetch ${response.url}`);
			}
			const data = await response.text();
			const xmlDocument = new DOMParser().parseFromString(data, "text/xml");
			if (!((xmlDocument.documentElement.namespaceURI === pageSnippets.PS_NAMESPACE_URI) && (xmlDocument.documentElement.localName === "pagesnippets")))
			{
				throw new Error(`"${url}" is not a PageSnippets XML-document.`);
			}
			await parse(xmlDocument.firstElementChild, "", "");
		}
	}

	/**
	 * Produces an actual HTML- or XML-element from a page snippet.
	 * @param {string} snippetKey Key of snippet to be produced.
	 * @param {PageSnippets.ProductionData} [data] Data needed to produce the snippet: values for placeholders, lists, event handler functions etc.
	 * @param {Intl.LocalesArgument} [locale] The locale to be used when formatting numbers and dates in `<ps:text>` nodes.
	 * @param {string} [_trace] _Restricted for internal use only._ Call history that lead to this production call.
	 * @returns The element that was build from the snippet using the given data.
	 */
	produce (snippetKey, data = {}, locale = "default", _trace = "")
	{
		const NODETYPE_ELEMENT = 1;
		const NODETYPE_TEXT = 3;

		/** Some attributes need to be set as the element object's property. This is the list of affected tags and attributes. */
		const PROPERTY_ATTRIBUTES = new Map(Object.entries({
			"INPUT": ["value"],
			"SELECT": ["value"],
		}));

		const getObjectValueByPath = (object, path, pathSeparator = ".") =>
		{
			let result = undefined;
			if (!!object && !!path)
			{
				const steps = path.split(pathSeparator);
				result = (steps.length === 1) ? object[steps[0]] : getObjectValueByPath(object[steps[0]], steps.splice(1).join(pathSeparator), pathSeparator);
			}
			return result;
		};

		/**
		 * Replaces all placeholders ("`{{key}}`") in a string with the respective values given in the production data.
		 *
		 * If there is no data for a placeholder, it is replaced by an empty string.
		 * @param {string} text String that may contain placeholders to be replaced.
		 * @param {PageSnippets.ProductionData} data Production data from which to insert values.
		 * @param {Element} [sourceNode] The snippets source node that does contain the variables (for `number-format` and `date-format` attributes).
		 * @returns The given string with placeholders replaced by values.
		 */
		const resolveVariables = (text, data, sourceNode) =>
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
									val = value.toLocaleDateString(locale, { weekday: "long" });
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
									val = value.toLocaleDateString(locale, { month: "long" });
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
		};

		/**
		 * Methods for processing the various pageSnippets tags.
		 * @type {{[tag: string]: PsProductionFunction}}
		 */
		const psTagProcessors = {
			"attribute": (sourceNode, targetElement, data, trace) =>
			{
				const helper = document.createElement("div");
				processNode(sourceNode.firstElementChild, helper, data, trace);
				targetElement.setAttribute(sourceNode.attributes.getNamedItem("name").value, helper.textContent);
			},
			"choose": (sourceNode, targetElement, data, trace) =>
			{
				const CHOOSE_MODE_STRICT = "strict";
				const CHOOSE_MODE_LAX = "lax";
				let chooseMode = (RegExp(`^${CHOOSE_MODE_STRICT}$|^${CHOOSE_MODE_LAX}$`).exec((sourceNode.getAttribute("mode") || CHOOSE_MODE_STRICT)) || [""])[0];
				if (chooseMode === "")
				{
					console.warn(`Invalid choose-mode "${sourceNode.getAttribute("mode")}", using "strict".\n` + this.#traceToString(trace));
					chooseMode = CHOOSE_MODE_STRICT;
				}
				let anyMatch = false;
				for (const childSourceNode of sourceNode.children)
				{
					const location = this.#updateCallHistory(childSourceNode, currentSnippetSource, trace);
					if ((childSourceNode.namespaceURI === pageSnippets.PS_NAMESPACE_URI) && (childSourceNode.localName === "if"))
					{
						const thisMatch = psTagProcessors["if"](childSourceNode, targetElement, data, location);
						anyMatch = anyMatch || thisMatch;
						if (anyMatch && (chooseMode === CHOOSE_MODE_STRICT))
						{
							break;
						}
					}
					else if ((childSourceNode.namespaceURI === pageSnippets.PS_NAMESPACE_URI) && (childSourceNode.localName === "else"))
					{
						if (!anyMatch)
						{
							processNode(childSourceNode, targetElement, data, location);
						}
					}
				}
			},
			"call-function": (sourceNode, targetElement, data, trace) =>
			{
				const functionName = sourceNode.getAttributeNS(pageSnippets.PS_NAMESPACE_URI, "name") || sourceNode.getAttribute("name");
				if (typeof data[functionName] !== "function")
				{
					throw new ReferenceError(`Reference to call "${functionName}" is not a function.\n` + this.#traceToString(trace));
				}
				const args = [];
				for (const child of sourceNode.children)
				{
					if ((child.namespaceURI === pageSnippets.PS_NAMESPACE_URI) && (child.localName === "argument"))
					{
						args.push(resolveVariables(child.getAttribute("value"), data));
					}
				}
				data[functionName](targetElement, data, ...args);
			},
			"for-each": (sourceNode, targetElement, data, trace) =>
			{
				const ObjectAssignEx = (...sources) =>
				{
					const result = {};
					for (const source of sources)
					{
						Object.defineProperties(result, Object.getOwnPropertyDescriptors(source));
						const proto = Object.getPrototypeOf(source);
						if (proto && (proto !== Object.prototype))
						{
							for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto)))
							{
								if (("get" in descriptor) || ("set" in descriptor))
								{
									Object.defineProperty(result, key, descriptor);
								}
							}
						}
					}
					return result;
				};
				const listKey = sourceNode.getAttributeNS(pageSnippets.PS_NAMESPACE_URI, "list") || sourceNode.getAttribute("list");
				const list = getObjectValueByPath(data, listKey);
				if (!Array.isArray(list))
				{
					throw new TypeError(`"${listKey}" is ${(list?.constructor.name ?? "undefined")}, expected Array.\n` + this.#traceToString(trace));
				}
				let index = 0;
				const itemsCount = list.length;
				for (const listItem of list)
				{
					const dataItem = (["string", "number", "boolean"].includes(typeof listItem) || Array.isArray(listItem)) ? { _value: listItem } : listItem;
					processNode(sourceNode, targetElement, ObjectAssignEx(data, dataItem, {
						_index: index,
						_position: index + 1,
						_count: itemsCount,
					}), trace);
					index += 1;
				}
			},
			"for-empty": (sourceNode, targetElement, data, trace) =>
			{
				const listKey = sourceNode.getAttributeNS(pageSnippets.PS_NAMESPACE_URI, "list") || sourceNode.getAttribute("list");
				const list = getObjectValueByPath(data, listKey);
				if (!Array.isArray(list))
				{
					throw new TypeError(`"${listKey}" is ${(list?.constructor.name ?? "undefined")}, expected Array.\n` + this.#traceToString(trace));
				}
				if (list.length === 0)
				{
					processNode(sourceNode, targetElement, data, trace);
				}
			},
			"if": (sourceNode, targetElement, data, trace) =>
			{
				const testExpression = sourceNode.getAttributeNS(pageSnippets.PS_NAMESPACE_URI, "test") || sourceNode.getAttribute("test");
				const functionBody = `return (${testExpression.replace(/'?\{\{/g, "this.").replace(/\}\}'?/g, "")})`;
				let testResult;
				try
				{
					testResult = Function(functionBody).call(data);
				}
				catch (err)
				{
					throw new err.constructor(`Cannot evaluate expression "${testExpression}": ${err.message}.\n` + this.#traceToString(trace));
				};
				if (testResult === true)
				{
					processNode(sourceNode, targetElement, data, trace);
				}
				return testResult;
			},
			"insert-snippet": (sourceNode, targetElement, data, trace) =>
			{
				const snippetPath = this.#normalizeSnippetKey(resolveVariables(sourceNode.getAttributeNS(pageSnippets.PS_NAMESPACE_URI, "name") || sourceNode.getAttribute("name"), data));
				if (!this.#snippets.has(snippetPath))
				{
					throw new ReferenceError(`Unknown snippet "${snippetPath}".\n` + this.#traceToString(trace));
				}
				for (const child of sourceNode.children)
				{
					if ((child.namespaceURI === pageSnippets.PS_NAMESPACE_URI) && (child.localName === "param"))
					{
						data[child.getAttribute("name")] = resolveVariables(child.getAttribute("value"), data);
					}
				}
				targetElement.appendChild(this.produce(snippetPath, data, locale, trace));
			},
			"text": (sourceNode, targetElement, data) =>
			{
				targetElement.appendChild(document.createTextNode(resolveVariables(sourceNode.firstChild.data, data, sourceNode)));
			},

		};

		/**
		 * Processes the source node to build the content of the target element.
		 * @type {PsProductionFunction}
		 */
		const processNode = (sourceNode, targetElement, data, trace) =>
		{
			for (const attribute of sourceNode.attributes)
			{
				if (attribute.namespaceURI === pageSnippets.PS_NAMESPACE_URI)
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
							console.warn(`Event handler "${attribute.value}" is not a function.\n` + this.#traceToString(trace));
						}
					}
				}
				else
				{
					targetElement.setAttributeNS(attribute.namespaceURI, attribute.localName, resolveVariables(attribute.value, data));
				}
			}
			for (const childSourceNode of sourceNode.childNodes)
			{
				switch (childSourceNode.nodeType)
				{
					case NODETYPE_ELEMENT:
						const location = this.#updateCallHistory(childSourceNode, currentSnippetSource, trace);
						if (childSourceNode.namespaceURI === pageSnippets.PS_NAMESPACE_URI)
						{
							const func = psTagProcessors[childSourceNode.localName];
							if (func)
							{
								func(childSourceNode, targetElement, data, location);
							}
							else
							{
								console.warn(`Element "${childSourceNode.nodeName}" not allowed here.\n${this.#traceToString(location)}`);
							}
						}
						else
						{
							const element = document.createElementNS(childSourceNode.namespaceURI || pageSnippets.HTML_NAMESPACE_URI, childSourceNode.tagName);
							processNode(childSourceNode, element, data, location);
							postProduction(childSourceNode, element, data, location);
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
						if (!/^\s*$/.test(childSourceNode.textContent))
						{
							targetElement.appendChild(document.createTextNode(resolveVariables(childSourceNode.textContent, data, childSourceNode.parentElement)));
						}
						break;
				}
			}
		};

		/**
		 * Handles `ps:postproduction` attributes in snippet nodes.
		 * Tries to call the named function given in the attribute.
		 * Removes the _ps:postproduction_ attribute from the target node.
		 * @deprecated // DEPRECATED: Remove at the end of 2026.
		 * @type {PsProductionFunction}
		 * @throws A `ReferenceError` if the referenced object is not a function.
		 */
		const postProduction = (sourceNode, targetElement, data, trace) =>
		{
			const postProductionFunction = sourceNode.getAttributeNS(pageSnippets.PS_NAMESPACE_URI, "postproduction");
			if (postProductionFunction)
			{
				console.warn("The 'ps:postproduction' attribute is deprecated and will be discontinued at the end of 2026.");
				targetElement.removeAttributeNS(pageSnippets.PS_NAMESPACE_URI, "postproduction");
				const referencedFunction = getObjectValueByPath(data, postProductionFunction);
				if (typeof referencedFunction !== "function")
				{
					throw new ReferenceError(`Post-production reference "${postProductionFunction}" is not a function.\n` + this.#traceToString(trace));
				}
				referencedFunction(targetElement, data);
			}
		};

		if (!["string", "undefined"].includes(typeof _trace))
		{
			throw new TypeError("Prohibited usage of _parentSnippetRef");
		}
		snippetKey = this.#normalizeSnippetKey(snippetKey);
		const snippet = this.getSnippet(snippetKey);
		if (_trace.includes(`${snippet.source}:${snippetKey}`))
		{
			throw new Error("Recursive snippet nesting.\n" + this.#traceToString(_trace));
		}
		const origin = this.#updateCallHistory(snippet.data, `${snippet.source}:${snippetKey}`, _trace);
		const result = document.createElementNS(snippet.namespace, snippet.data.localName);
		const currentSnippetSource = `${snippet.source}:${snippetKey}`;
		processNode(snippet.data, result, data, origin);
		postProduction(snippet.data, result, data, origin);
		return result;
	};

	/**
	 * Returns a boolean of whether a certain snippet does exist or not.
	 * @param {string} snippetKey Key of desired snippet. This may be a single string (snippet name including its path), or an array with an item for each path crumb and the snippets name.
	 * @returns `true` if a snippet with the given key exists, otherwise `false`.
	 */
	hasSnippet (snippetKey)
	{
		snippetKey = this.#normalizeSnippetKey(snippetKey);
		return this.#snippets.has(snippetKey);
	}

	/**
	 * Provides data of a snippet.
	 * @param {string} snippetKey Key of desired snippet. This may be a single string (snippet name including its path), or an array with an item for each path crumb and the snippets name.
	 * @returns Meta data of the requested snippet.
	 * @throws A `ReferenceError` if no such snippet exists.
	 */
	getSnippet (snippetKey)
	{
		snippetKey = this.#normalizeSnippetKey(snippetKey);
		const snippet = this.#snippets.get(snippetKey);
		if (!snippet)
		{
			throw new ReferenceError(`No such snippet: "${snippetKey}".`);
		}
		return snippet;
	}

	/**
	 * Provides a list of all snippets within a snippet group.
	 * @param {string} [path] Path of snippet group from which to get its snippets.
	 * @param {boolean} [recursive] Whether to get snippets from all sub groups within that group.
	 * @returns Fully qualified keys of all snippets within the given group.
	 */
	getSnippets (path = "/", recursive = false)
	{
		path = this.#normalizeSnippetKey(path);
		if (!path.endsWith("/"))
		{
			path += "/";
		}
		const trail = recursive ? "" : "$";
		const filterRex = new RegExp(`^${path}[^\/]+${trail}`);
		const result = Array.from(this.#snippets.keys()).filter(v => filterRex.test(v));
		return result.sort();
	}

	/**
	 * Provides a list of all sub groups within a snippet group.
	 * @param {string} [path] Snippet group from which to get sub-groups.
	 * @param {boolean} [recursive] Whether to also get groups from all sub groups.
	 * @returns Paths of snippet groups within the requested group.
	 */
	getSnippetGroups (path = "/", recursive = false)
	{
		path = this.#normalizeSnippetKey(path);
		const trail = recursive ? ".+" : "[^\/]+";
		const filterRex = new RegExp(`^(${path}\/${trail})\/`);
		const groups = new Set();
		for (const key of this.#snippets.keys())
		{
			const rexMatch = filterRex.exec(key);
			(rexMatch) && groups.add(rexMatch[1]);
		}
		return Array.from(groups).sort().map(g => g + "/");
	}
};

/**
 * @callback PsProductionFunction
 * @param {Element} sourceNode Source that defined the element that is currently build.
 * @param {Element} targetElement Currently processed target element.
 * @param {PageSnippets.ProductionData} data Data provided to build the target element.
 * @param {string} trace List of source document nodes that lead to this function call.
 * @returns {void}
 */
