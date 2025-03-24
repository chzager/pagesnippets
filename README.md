# pageSnippets

pageSnippets is a JavaScript tool for dynamically and easily creating complex HTML or XML. Outsource parts of your big and confusing HTML and generate them on demand. No more need for messy nested ~~`document.createElement()`~~, just code your HTML and **`produce()`** the snippets.

[![ECMAScript6](https://img.shields.io/badge/ECMAScript-2021-0066ff)](#)\
[![Standalone](https://img.shields.io/badge/Standalone-yes-33cc33)](#)\
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](http://www.apache.org/licenses/LICENSE-2.0)

## Example

This short example to gives you a glimpse how easy it is to use pageSnippets.

1. Compose your snippets as an XML file:

```xml filename=my-snippet.xml
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<ps:pagesnippets xmlns:ps="https://github.com/chzager/pagesnippets">
	<ps:snippet name="hello">
		<h1>Hello world!</h1>
	</ps:snippet>
</ps:pagesnippets>
```

1. Include `pageSnippets2.js` (or the minfied version) in your HTML file.

```html filename=index.html
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
	<head>
		<script src="https://cdn.jsdelivr.net/gh/chzager/pagesnippets/pagesnippets2.min.js"></script>
	</head>
	<body>
		<!-- Whatever. -->
	</body>
	<script>
		<!-- The script comes in step 3. -->
	</script>
</html>
```

3. Have a short script that imports the snippet file. Produce the snippet and place it in the document.

```javascript
pageSnippets.import("my-snippet.xml").then(() => document.body.appendChild(pageSnippets.produce("hello")));
```

You're done.

Of course there's more! Unleash its full power with [placeholders](https://github.com/chzager/pagesnippets/wiki/Placeholders), [conditions](https://github.com/chzager/pagesnippets/wiki/Conditions), [lists](https://github.com/chzager/pagesnippets/wiki/Lists) and much more. Find a full
reference in the [wiki](https://github.com/chzager/pagesnippets/wiki).

## Licence

pageSnippets is licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).
