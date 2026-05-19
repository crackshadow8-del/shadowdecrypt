const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json({ limit: "50mb" }));

const BOT_TOKEN = process.env.BOT_TOKEN;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!fs.existsSync("downloads")) fs.mkdirSync("downloads");
if (!fs.existsSync("output")) fs.mkdirSync("output");

async function sendMessage(chatId, text) {
  await axios.post(`${API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "HTML"
  });
}

async function sendDocument(chatId, filePath, caption = "") {
  const form = new FormData();

  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("document", fs.createReadStream(filePath));

  await axios.post(`${API}/sendDocument`, form, {
    headers: form.getHeaders()
  });
}

async function downloadTelegramFile(fileId, savePath) {
  const res = await axios.get(`${API}/getFile?file_id=${fileId}`);

  const filePath = res.data.result.file_path;

  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

  const writer = fs.createWriteStream(savePath);

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream"
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function decryptHTML(inputPath, outputPath) {

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  const page = await browser.newPage();

  await page.goto(`file://${path.resolve(inputPath)}`, {
    waitUntil: "networkidle2",
    timeout: 0
  });

  await page.waitForTimeout(5000);

  const finalHTML = await page.evaluate(() => {

    function isReadable(text) {
      const cleanText = text.replace(/[\x00-\x1F\x7F]+/g, '').trim();

      return !(
        cleanText === "" ||
        /(&#\d+;)|(&#x[0-9a-f]+;)/i.test(cleanText) ||
        /%[0-9a-f]{2}/i.test(cleanText)
      );
    }

    function getHTMLFromDOM(node) {

      let html = "";

      switch (node.nodeType) {

        case Node.ELEMENT_NODE:

          let tag = node.tagName.toLowerCase();

          html += `<${tag}`;

          for (let attr of node.attributes) {
            html += ` ${attr.name}="${attr.value}"`;
          }

          html += ">";

          for (let child of node.childNodes) {
            html += getHTMLFromDOM(child);
          }

          html += `</${tag}>`;

          break;

        case Node.TEXT_NODE:

          if (
            node.parentElement &&
            node.parentElement.tagName.toLowerCase() === "script"
          ) {
            html += node.nodeValue;
          }
          else if (isReadable(node.nodeValue)) {
            html += node.nodeValue;
          }

          break;

        case Node.COMMENT_NODE:
          html += `<!--${node.nodeValue}-->`;
          break;
      }

      return html;
    }

    return getHTMLFromDOM(document.documentElement);
  });

  fs.writeFileSync(outputPath, finalHTML);

  await browser.close();
}

app.get("/", (req, res) => {
  res.send("SHADOWDECRYPT BOT ONLINE");
});

app.post("/webhook", async (req, res) => {

  try {

    const message = req.body.message;

    if (!message) {
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;

    if (message.text === "/start") {

      await sendMessage(
        chatId,
        "🔥 SHADOWDECRYPT BOT ONLINE\n\nSend encrypted HTML file."
      );

      return res.sendStatus(200);
    }

    if (!message.document) {
      return res.sendStatus(200);
    }

    const fileId = message.document.file_id;
    const fileName = message.document.file_name || "file.html";

    const inputPath = `downloads/${Date.now()}_${fileName}`;
    const outputPath = `output/decrypted_${fileName}`;

    await sendMessage(chatId, "📥 Downloading HTML...");

    await downloadTelegramFile(fileId, inputPath);

    await sendMessage(chatId, "⚡ Executing JavaScript & decrypting...");

    await decryptHTML(inputPath, outputPath);

    await sendDocument(
      chatId,
      outputPath,
      "✅ HTML Decrypted Successfully"
    );

    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    return res.sendStatus(200);

  } catch (err) {

    console.error(err);

    return res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
