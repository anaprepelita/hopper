export function mobileHTML(html, atRoot = false) {
  return html
    .replace('<html lang="ro">', '<html lang="ro" class="hopper-native">')
    .replace("<head>", `<head>${atRoot ? '\n    <base href="/app/" />' : ""}`)
    .replace(
      "</head>",
      `<link rel="stylesheet" href="fonts/press-start-2p/400.css" />
    ${[400, 600, 700, 800].map((weight) => `<link rel="stylesheet" href="fonts/nunito/${weight}.css" />`).join("\n    ")}
    <link rel="stylesheet" href="native.css" />
  </head>`,
    )
    .replace("</body>", '  <script src="native-runtime.js"></script>\n  </body>');
}
