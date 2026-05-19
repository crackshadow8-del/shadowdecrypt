const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const puppeteer = require("puppeteer");

const app = express();

app.use(express.json({
  limit: "50mb"
}));

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const BOT_TOKEN = process.env.BOT_TOKEN;

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!fs.existsSync("downloads")) {
  fs.mkdirSync("downloads");
}

if (!fs.existsSync("output")) {
  fs.mkdirSync("output");
}

/* ================= SEND MESSAGE ================= */

async function sendMessage(chatId, text) {

  await axios.post(`${API}/sendMessage`, {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  });
}

/* ================= SEND DOCUMENT ================= */

async function sendDocument(chatId, filePath, caption = "") {

  const form = new FormData();

  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("document", fs.createReadStream(filePath));

  await axios.post(
    `${API}/sendDocument`,
    form,
    {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    }
  );
}

/* ================= DOWNLOAD FILE ================= */

async function downloadTelegramFile(fileId, savePath) {

  const res = await axios.get(
    `${API}/getFile?file_id=${fileId}`
  );

  const telegramFilePath =
    res.data.result.file_path;

  const fileURL =
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${telegramFilePath}`;

  const writer = fs.createWriteStream(savePath);

  const response = await axios({
    url: fileURL,
    method: "GET",
    responseType: "stream"
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {

    writer.on("finish", resolve);

    writer.on("error", reject);
  });
}

/* ================= DECRYPT HTML ================= */

async function decryptHTML(inputPath, outputPath) {

  const browser = await puppeteer.launch({

    headless: true,

    executablePath: puppeteer.executablePath(),

    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote"
    ]
  });

  const page = await browser.newPage();

  await page.goto(
    `file://${path.resolve(inputPath)}`,
    {
      waitUntil: "networkidle2",
      timeout: 30000
    }
  );

  await new Promise(resolve =>
    setTimeout(resolve, 3000)
  );

  const finalHTML = await page.evaluate(() => {

    function isReadable(text) {

      const cleanText =
        text
          .replace(/[\x00-\x1F\x7F]+/g, "")
          .trim();

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

          let tag =
            node.tagName.toLowerCase();

          html += `<${tag}`;

          for (let attr of node.attributes) {

            html += ` ${attr.name}="${attr.value}"`;
          }

          html += ">";

          // KEEP SCRIPT CONTENT
          if (tag === "script") {

            html += node.innerHTML || "";
          }
          else {

            for (let child of node.childNodes) {

              html += getHTMLFromDOM(child);
            }
          }

          html += `</${tag}>`;

          break;

        case Node.TEXT_NODE:

          if (isReadable(node.nodeValue)) {

            html += node.nodeValue;
          }

          break;

        case Node.COMMENT_NODE:

          html += `<!--${node.nodeValue}-->`;

          break;
      }

      return html;
    }

    /* ================= SAVE ORIGINAL SCRIPTS ================= */

    const originalScripts = Array.from(
      document.querySelectorAll("script")
    )
    .map(script => script.outerHTML)
    .join("\n");

    /* ================= SAVE FINAL DOM ================= */

    const finalDOM =
      getHTMLFromDOM(document.documentElement);

    return (
      originalScripts +
      "\n\n" +
      finalDOM
    );
  });

  fs.writeFileSync(outputPath, finalHTML);

  await browser.close();
}

/* ================= ROOT ================= */

app.get("/", (req, res) => {

  res.send("SHADOWDECRYPT BOT ONLINE");
});

/* ================= WEBHOOK ================= */

app.post("/webhook", async (req, res) => {

  try {

    const message = req.body.message;

    if (!message) {

      return res.sendStatus(200);
    }

    const chatId = message.chat.id;

    /* ================= START ================= */

    if (message.text === "/start") {

      await sendMessage(
        chatId,
        "🔥 <b>SHADOWDECRYPT BOT ONLINE</b>\n\nSend encrypted HTML file."
      );

      return res.sendStatus(200);
    }

    /* ================= REQUIRE FILE ================= */

    if (!message.document) {

      await sendMessage(
        chatId,
        "📄 Please send HTML file."
      );

      return res.sendStatus(200);
    }

    /* ================= FILE LIMIT ================= */

    if (
      message.document.file_size >
      20 * 1024 * 1024
    ) {

      await sendMessage(
        chatId,
        "❌ File too large. Max 20MB."
      );

      return res.sendStatus(200);
    }

    /* ================= FILE INFO ================= */

    const fileId =
      message.document.file_id;

    const fileName =
      message.document.file_name || "file.html";

    const inputPath =
      `downloads/${Date.now()}_${fileName}`;

    const outputPath =
      `output/decrypted_${fileName}`;

    /* ================= DOWNLOAD ================= */

    await sendMessage(
      chatId,
      "📥 Downloading HTML..."
    );

    await downloadTelegramFile(
      fileId,
      inputPath
    );

    /* ================= DECRYPT ================= */

    await sendMessage(
      chatId,
      "⚡ Executing JavaScript & decrypting..."
    );

    await decryptHTML(
      inputPath,
      outputPath
    );

    /* ================= SEND RESULT ================= */

    await sendDocument(
      chatId,
      outputPath,
      "✅ HTML Decrypted Successfully"
    );

    /* ================= CLEANUP ================= */

    if (fs.existsSync(inputPath)) {

      fs.unlinkSync(inputPath);
    }

    if (fs.existsSync(outputPath)) {

      fs.unlinkSync(outputPath);
    }

    return res.sendStatus(200);

  } catch (err) {

    console.error(err);

    return res.sendStatus(500);
  }
});

/* ================= START SERVER ================= */

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `Server running on ${PORT}`
  );
});
