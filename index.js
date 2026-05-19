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

  form.append(
    "document",
    fs.createReadStream(filePath)
  );

  await axios.post(
    `${API}/sendDocument`,
    form,
    {
      headers: form.getHeaders(),
      maxBodyLength: Infinity
    }
  );

}

/* ================= DOWNLOAD FILE ================= */

async function downloadTelegramFile(fileId, savePath) {

  const res = await axios.get(
    `${API}/getFile?file_id=${fileId}`
  );

  const telegramPath =
    res.data.result.file_path;

  const fileUrl =
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${telegramPath}`;

  const writer =
    fs.createWriteStream(savePath);

  const response = await axios({
    url: fileUrl,
    method: "GET",
    responseType: "stream"
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {

    writer.on("finish", resolve);

    writer.on("error", reject);

  });

}

/* ================= REAL HTML DECRYPT ================= */

async function decryptHTML(inputPath, outputPath) {

  const browser = await puppeteer.launch({

    headless: true,

    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]

  });

  const page = await browser.newPage();

  await page.setViewport({
    width: 1920,
    height: 1080
  });

  await page.goto(

    `file://${path.resolve(inputPath)}`,

    {
      waitUntil: "networkidle2",
      timeout: 0
    }

  );

  // wait for scripts to finish
  await new Promise(resolve =>
    setTimeout(resolve, 7000)
  );

  const finalHTML = await page.evaluate(() => {

    // remove injected decryptor scripts if any
    document.querySelectorAll("script").forEach(script => {

      if (
        script.innerHTML.includes("getHTMLFromDOM") ||
        script.innerHTML.includes("isReadable")
      ) {
        script.remove();
      }

    });

    // return FULL rendered html
    return document.documentElement.outerHTML;

  });

  fs.writeFileSync(
    outputPath,
    finalHTML,
    "utf8"
  );

  await browser.close();

}

/* ================= HOME ================= */

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

    /* ===== START ===== */

    if (message.text === "/start") {

      await sendMessage(

        chatId,

        `🔥 <b>SHADOWDECRYPT BOT</b>

Send encrypted HTML file.

✅ Full HTML
✅ Full CSS
✅ Full JavaScript
✅ Rendered DOM
✅ Proper structure`

      );

      return res.sendStatus(200);

    }

    /* ===== ONLY FILES ===== */

    if (!message.document) {

      await sendMessage(
        chatId,
        "📄 Send HTML file."
      );

      return res.sendStatus(200);

    }

    const fileId =
      message.document.file_id;

    const fileName =
      message.document.file_name ||
      "file.html";

    const inputPath =
      `downloads/${Date.now()}_${fileName}`;

    const outputPath =
      `output/decrypted_${fileName}`;

    /* ===== DOWNLOAD ===== */

    await sendMessage(
      chatId,
      "📥 Downloading HTML..."
    );

    await downloadTelegramFile(
      fileId,
      inputPath
    );

    /* ===== DECRYPT ===== */

    await sendMessage(
      chatId,
      "⚡ Executing JavaScript..."
    );

    await decryptHTML(
      inputPath,
      outputPath
    );

    /* ===== SEND FILE ===== */

    await sendDocument(

      chatId,

      outputPath,

      "✅ HTML Decrypted Successfully"

    );

    /* ===== CLEANUP ===== */

    if (fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    return res.sendStatus(200);

  }

  catch (err) {

    console.log(err);

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
