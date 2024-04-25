/**
 * @typedef PageSnippetsProductionData
 * Data record that is used for producing a page snippet or any of a page snippets elements.
 * @type {{[key: string]: any}}
 *
 * @callback PageSnippetsProductionCallback
 * Function type that is used as callback in `ps:postproduction` attributes and `<ps:call-function>` nodes.
 * @param {Element} element Currently processed target element.
 * @param {PageSnippetsProductionData} data Data provided to build the target element.
 *
 * @typedef PageSnippetsMeta
 * A page snippets meta data.
 * @property {string} key Identifier key (including path) of that snippet.
 * @property {string} source URL from which this snippet was loaded.
 * @property {string} namespace Namespace URI of this snippets root node.
 * @property {Element} data XML source data of that snippet.
 *
 * @callback PageSnippetsProductionFunction
 * Function type used in production methods. This does not return any value but manipulate the `targetElement`object.
 * @param {Element} sourceNode Source that defined the element that is currently build.
 * @param {Element} targetElement Currently processed target element.
 * @param {PageSnippetsProductionData} data Data provided to build the target element.
 * @param {string} origin Listing of source document nodes that lead to this function call.
 * @returns {void}
 */
