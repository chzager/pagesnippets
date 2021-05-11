# pageSnippets

pageSnippets is a JavaScript tool for dynamically and easily creating complex HTML or XML. Outsource parts of your big and confusing HTML and generate them on demand. No more need for messy nested ~~`document.createElement()`~~, just code your HTML and **`produce()`** the snippets.

[![ECMAScript6](https://img.shields.io/badge/ECMAScript-6-0066ff)](#)\
[![Standalone](https://img.shields.io/badge/Standalone-yes-33cc33)](#)\
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](http://www.apache.org/licenses/LICENSE-2.0)

## Example

This short example to gives you a glimpse how easy it is to use pageSnippets.

1) Compose your snippets as an XML file:

```XML
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<ps:pagesnippets xmlns:ps="https://github.com/Suppenhuhn79/pagesnippets">
  <ps:snippet name="hello">
    <h1>Hello world!</h1>
  </ps:snippet>
</ps:pagesnippets>
```

2) Include `pageSnippets.js` in your HTML file.
```HTML
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>pageSnippets Demo</title>
    <meta charset="utf-8" />
    <script src="pagesnippets.js"></script>
  </head>
```
3) Have a short script that imports the snippet file. Produce the snippet and place it in the document.
```HTML
  <body>
    <script>
      pageSnippets.import("snippet.xml").then(() => document.body.appendChild(pageSnippets.hello.produce()));
    </script>
  </body>
</html>
```
You're done.

Of course there's more! Unleash its full power with [variables](https://github.com/Suppenhuhn79/pagesnippets/wiki/Variables), [conditions](https://github.com/Suppenhuhn79/pagesnippets/wiki/Conditions), [lists](https://github.com/Suppenhuhn79/pagesnippets/wiki/Lists) and much more. Find a full
reference in the [wiki](https://github.com/Suppenhuhn79/pagesnippets/wiki).

## Licence

pageSnippets is licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).
