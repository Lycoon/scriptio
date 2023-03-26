<p align="center">
    <img src="public/images/banner.png"  width="540" height="230">
</p>

<p align="center">
  Minimalist tool for perfectionist screenwriters
</p>

<p align="center">
    <img alt="Discord" src="https://img.shields.io/discord/985259837602553876">
    <img alt="GitHub code size in bytes" src="https://img.shields.io/github/languages/code-size/Lycoon/scriptio">
</p>

# Purpose

I like writing and creating stories in my spare time. For the last few years I have been using plenty of online screenplay editors such as _Celtx_, _WriterDuet_ or _KitScenarist_, each of these being more or less enjoyable. However, none of them met my criteria. I wanted a free, dead simple, but pretty screenplay editor.

My biggest inspiration is by far _Amazon Story Writer_, a very handy writing tool published by Amazon by 2015, which has unfortunately been shut down on June 30, 2019.

# Features

-   Online and offline mode (yet to come)
-   Export to PDF or .fountain format
-   Dark theme
-   Screenplay statistics
-   Scene navigation
-   Character management

# Dependencies

| Name         | Usage                                              | Package                                                                                      |
| ------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| prisma       | Database ORM                                       | [![](https://img.shields.io/npm/v/prisma)](https://www.npmjs.com/package/prisma)             |
| chart.js     | Displaying charts for statistics                   | [![](https://img.shields.io/npm/v/chart.js)](https://www.npmjs.com/package/chart.js)         |
| file-saver   | Creating files when exporting non-PDF screenplays  | [![](https://img.shields.io/npm/v/file-saver)](https://www.npmjs.com/package/file-saver)     |
| iron-session | Signed and encrypted cookies for authentication    | [![](https://img.shields.io/npm/v/iron-session)](https://www.npmjs.com/package/iron-session) |
| hogan.js     | Templating language for email generation           | [![](https://img.shields.io/npm/v/hogan.js)](https://www.npmjs.com/package/hogan.js)         |
| inline-css   | Used along with hogan.js for inlining CSS in email | [![](https://img.shields.io/npm/v/inline-css)](https://www.npmjs.com/package/inline-css)     |
| nodemailer   | Sending emails from NodeJS                         | [![](https://img.shields.io/npm/v/nodemailer)](https://www.npmjs.com/package/nodemailer)     |
| pdfmake      | Generating PDF files when exporting screenplays    | [![](https://img.shields.io/npm/v/pdfmake)](https://www.npmjs.com/package/pdfmake)           |
| use-debounce | Allow executing actions with delay                 | [![](https://img.shields.io/npm/v/use-debounce)](https://www.npmjs.com/package/use-debounce) |
| tauri        | Allow converting frontend app to desktop           | [![](https://img.shields.io/crates/v/tauri.svg)](https://crates.io/crates/tauri)             |

# How to launch

1. `npm install`
2. `npm run dev`
3. `http://localhost:3000`
