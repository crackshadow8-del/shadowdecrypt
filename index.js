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

/* ================= CONFIG ================= */

const BOT_TOKEN = process.env.BOT_TOKEN;

const API =
  `https://api.telegram.org/bot${BOT_TOKEN}`;

const DOWNLOAD_DIR = "downloads";

const OUTPUT_DIR = "output";

/* ================= CREATE FOLDERS ================= */

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

/* ================= SEND MESSAGE ================= */

async function sendMessage(chatId, text) {

  try {

    await axios.post(
      `${API}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: "HTML"
      }
    );

  } catch (err) {

    console.log(
      err.response?.data ||
      err.message
    );
  }
}

/* ================= SEND DOCUMENT ================= */

async function sendDocument(
  chatId,
  filePath,
  caption = ""
) {

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

async function downloadTelegramFile(
  fileId,
  savePath
) {

  const res = await axios.get(
    `${API}/getFile?file_id=${fileId}`
  );

  const tgPath =
    res.data.result.file_path;

  const fileUrl =
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgPath}`;

  const response = await axios({
    url: fileUrl,
    method: "GET",
    responseType: "stream"
  });

  const writer =
    fs.createWriteStream(savePath);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {

    writer.on("finish", resolve);

    writer.on("error", reject);

  });
}

/* ================= WAIT SCRIPT ================= */

const WAIT_SCRIPT = `
<script>

window.__SHADOW_READY__ = false;

setTimeout(() => {

  window.__SHADOW_READY__ = true;

}, 60000);

</script>
`;

/* ================= CLEAN HTML ================= */

function cleanHTML(html) {

  // remove ONLY our injected script
  html = html.replace(
    /<script>[\s\S]*?__SHADOW_READY__[\s\S]*?<\/script>/gi,
    ""
  );

  // remove analytics scripts only
  html = html.replace(
    /<script[^>]*src="[^"]*(analytics|tracker|googletagmanager)[^"]*"[^>]*><\/script>/gi,
    ""
  );

  // remove hidden iframes only
  html = html.replace(
    /<iframe[^>]*(display\s*:\s*none|visibility\s*:\s*hidden)[^>]*>[\s\S]*?<\/iframe>/gi,
    ""
  );

  return html;
}

/* ================= DECRYPT HTML ================= */

async function decryptHTML(
  inputPath,
  outputPath
) {

  const originalHTML =
    fs.readFileSync(inputPath, "utf8");

  /* inject runtime wait script */

  const modifiedHTML =
    originalHTML + WAIT_SCRIPT;

  const tempPath =
    inputPath + "_runtime.html";

  fs.writeFileSync(
    tempPath,
    modifiedHTML,
    "utf8"
  );

  const browser =
    await puppeteer.launch({

      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

  let timeoutHandle;

  try {

    const page =
      await browser.newPage();

    /* emergency kill */

    timeoutHandle = setTimeout(
      async () => {

        try {
          await browser.close();
        } catch {}

      },
      120000
    );

    /* open html */

    await page.goto(
      `file://${path.resolve(tempPath)}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 0
      }
    );

    /* wait full runtime execution */

    await page.waitForFunction(
      () => window.__SHADOW_READY__ === true,
      {
        timeout: 0
      }
    );

    /* get FINAL rendered DOM */

    let finalHTML =
      await page.evaluate(() => {

        const cloned =
          document.documentElement.cloneNode(true);

        return cloned.outerHTML;
      });

    /* clean only injected junk */

    finalHTML =
      cleanHTML(finalHTML);

    fs.writeFileSync(
      outputPath,
      finalHTML,
      "utf8"
    );

  }

  finally {

    clearTimeout(timeoutHandle);

    try {
      await browser.close();
    } catch {}

    /* cleanup temp */

    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

/* ================= AUTO CLEANUP ================= */

setInterval(() => {

  try {

    const folders = [
      DOWNLOAD_DIR,
      OUTPUT_DIR
    ];

    folders.forEach(folder => {

      fs.readdirSync(folder)
      .forEach(file => {

        const filePath =
          path.join(folder, file);

        const stats =
          fs.statSync(filePath);

        const age =
          Date.now() - stats.mtimeMs;

        // delete after 30 mins
        if (age > 1800000) {

          fs.unlinkSync(filePath);
        }
      });
    });

  } catch {}

}, 600000);

/* ================= HOME ================= */

app.get("/", (req, res) => {

  res.send(
    "SHADOWDECRYPT BOT ONLINE"
  );
});

/* ================= WEBHOOK ================= */

app.post(
  "/webhook",
  async (req, res) => {

    try {

      const message =
        req.body.message;

      if (!message) {

        return res.sendStatus(200);
      }

      const chatId =
        message.chat.id;

      /* ================= START ================= */

      if (
        message.text === "/start"
      ) {

        await sendMessage(
          chatId,
          "🔥 SHADOWDECRYPT BOT ONLINE\n\nSend encrypted HTML file."
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

      const fileId =
        message.document.file_id;

      const fileName =
        message.document.file_name ||
        "file.html";

      const ext =
        path.extname(fileName)
        .toLowerCase();

      if (
        ext !== ".html" &&
        ext !== ".htm"
      ) {

        await sendMessage(
          chatId,
          "❌ Only HTML files allowed."
        );

        return res.sendStatus(200);
      }

      const inputPath =
        path.join(
          DOWNLOAD_DIR,
          `${Date.now()}_${fileName}`
        );

      const outputPath =
        path.join(
          OUTPUT_DIR,
          `decrypted_${Date.now()}_${fileName}`
        );

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
        "⚡ Executing JavaScript & decrypting...\n⏳ This may take up to 60 seconds."
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

      if (
        fs.existsSync(inputPath)
      ) {

        fs.unlinkSync(inputPath);
      }

      if (
        fs.existsSync(outputPath)
      ) {

        fs.unlinkSync(outputPath);
      }

      return res.sendStatus(200);

    }

    catch (err) {

      console.log(err);

      return res.sendStatus(500);
    }
  }
);

/* ================= START SERVER ================= */

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );
});
