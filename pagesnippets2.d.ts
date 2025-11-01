/**
 * PageSnippets - dynamically load and produce HTML or XML.
 * @version 2.2.2
 * @copyright (c) 2023 Christoph Zager
 * @license Apache-2.0 - See the full license text at http://www.apache.org/licenses/LICENSE-2.0
 * @link https://github.com/chzager/pagesnippets
 */
declare const pageSnippets: pageSnippets;
interface pageSnippets {
	/**
	 * The locale to be used when formatting numbers and dates in `<ps:text>` nodes.
	 * Default: `"default"`.
	 */
	locale: Intl.LocalesArgument;

	/**
	 * Imports a PageSnippets file.
	 *
	 * This instantly adds the scripts and stylesheets referenced in the file to the current HTML document.
	 * You need to call {@linkcode pageSnippets.produce()} to get a snippet node that can be placed on the page.
	 *
	 * @param url URL of PageSnippets XML file to be loaded.
	 * @param headers Custom headers to pass along with the request.
	 * @returns A `Promise` that resolves after the PageSnippet and all it's referenced files are loaded, or rejects with an error.
	 */
	import(url: string, headers?: HeadersInit): Promise<void>;

	/**
	 * Produces an actual HTML- or XML-element from a page snippet.
	 * @param snippetKey Key of snippet to be produced. This may be a single string (snippet name including its path), or an array with an item for each path crumb and the snippets name.
	 * @param data Data needed to produce the snippet: values for placeholders, lists, event handler functions etc.
	 * @returns The element that was build from the snippet using the given data.
	 */
	produce(snippetKey: string, data?: PageSnippetsProductionData): Element;

	/**
	 * Returns a boolean of whether a certain snippet does exist or not.
	 * @param snippetKey Key of desired snippet. This may be a single string (snippet name including its path), or an array with an item for each path crumb and the snippets name.
	 * @returns `true` if a snippet with the given key exists, otherwise `false`.
	 */
	hasSnippet(snippetKey: string): boolean;

	/**
	 * Provides data of a snippet.
	 * @param snippetKey Key of desired snippet. This may be a single string (snippet name including its path), or an array with an item for each path crumb and the snippets name.
	 * @returns Meta data of the requested snippet.
	 */
	getSnippet(snippetKey: string): PageSnippetsMeta | null;

	/**
	 * Provides a list of all snippets within a snippet group.
	 * @param path Path of snippet group from which to get its snippets.
	 * @param recursive Whether to get snippets from all sub groups within that group.
	 * @returns Fully qualified keys of all snippets within the given group.
	 */
	getSnippets(path?: string, recursive?: boolean): Array<string>;

	/**
	 * Provides a list of all sub groups within a snippet group.
	 * @param path Snippet group from which to get sub-groups.
	 * @param recursive Whether to also get groups from all sub groups.
	 * @returns Paths of snippet groups within the requested group.
	 */
	getSnippetGroups(path?: string, recursive?: boolean): Array<string>;
}

/** Data record that is used for producing a page snippet or any of a page snippets elements. */
interface PageSnippetsProductionData {
	[key: string]: any;
}

/**
 * Function type that is used as a callback in `ps:postproduction` attributes nodes.
 * @param element Currently processed target element.
 * @param data Data provided to build the target element.
 */
type PageSnippetsProductionCallback = (element: Element, data: PageSnippetsProductionData) => void;

/**
 * Function type that is used as a callback in `<ps:call-function>` nodes.
 * @param element Currently processed target element.
 * @param data Data provided to build the target element.
 * @param args Additional arguments given in the `<ps:argument>` child nodes.
 */
type PageSnippetsCallFunction = (element: Element, data: PageSnippetsProductionData, ...args: string[]) => void;

/** A page snippets meta data. */
interface PageSnippetsMeta {
	/** Identifier key (including path) of that snippet. */
	key: string;

	/** URL from which this snippet was loaded. */
	source: string;

	/** Namespace URI of this snippet's root node. */
	namespace: string;

	/** XML source data of that snippet. */
	data: Element;
}
