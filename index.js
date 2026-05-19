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

const API =
  `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!fs.existsSync("downloads")) {
  fs.mkdirSync("downloads");
}

if (!fs.existsSync("output")) {
  fs.mkdirSync("output");
}

/* ================= SEND MESSAGE ================= */

async function sendMessage(chatId, text) {

  return axios.post(
    `${API}/sendMessage`,
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML"
    }
  );
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

  return axios.post(
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

  const tgFilePath =
    res.data.result.file_path;

  const fileURL =
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgFilePath}`;

  const response = await axios({
    url: fileURL,
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

/* ================= DECRYPT ENGINE ================= */

async function decryptHTML(
  inputPath,
  outputPath
) {

  const browser =
    await puppeteer.launch({

      headless: "new",

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

  try {

    const page =
      await browser.newPage();

    await page.setViewport({
      width: 1920,
      height: 1080
    });

    /* ================= HOOK SCRIPTS ================= */

    await page.evaluateOnNewDocument(() => {

      window.__shadow_scripts = [];

      /* ===== capture appendChild scripts ===== */

      const originalAppend =
        Element.prototype.appendChild;

      Element.prototype.appendChild =
        function(child) {

          try {

            if (
              child &&
              child.tagName === "SCRIPT"
            ) {

              window.__shadow_scripts.push(
                child.outerHTML ||
                child.innerHTML ||
                ""
              );
            }

          } catch(e) {}

          return originalAppend.call(
            this,
            child
          );
        };

      /* ===== capture document.write ===== */

      const originalWrite =
        document.write;

      document.write = function(html) {

        try {

          window.__shadow_scripts.push(
            html
          );

        } catch(e) {}

        return originalWrite.call(
          this,
          html
        );
      };

      /* ===== capture eval ===== */

      const originalEval = window.eval;

      window.eval = function(code) {

        try {

          window.__shadow_scripts.push(
            `<script>${code}</script>`
          );

        } catch(e) {}

        return originalEval(code);
      };

      /* ===== capture Function ===== */

      const OriginalFunction =
        window.Function;

      window.Function = function(...args) {

        try {

          const body =
            args.join(",");

          window.__shadow_scripts.push(
            `<script>${body}</script>`
          );

        } catch(e) {}

        return OriginalFunction(...args);
      };

    });

    /* ================= OPEN FILE ================= */

    await page.goto(

      `file://${path.resolve(inputPath)}`,

      {
        waitUntil: "networkidle2",
        timeout: 0
      }
    );

    /* ================= WAIT ================= */

    await new Promise(resolve =>
      setTimeout(resolve, 10000)
    );

    /* ================= GET FINAL HTML ================= */

    const finalHTML =
      await page.evaluate(() => {

        /* ===== remove huge comments ===== */

        const comments = [];

        const walker =
          document.createTreeWalker(
            document,
            NodeFilter.SHOW_COMMENT
          );

        while (walker.nextNode()) {

          comments.push(
            walker.currentNode
          );
        }

        comments.forEach(comment => {

          const txt =
            comment.nodeValue || "";

          if (
            txt.length > 100000
          ) {
            comment.remove();
          }

        });

        /* ===== remove ONLY huge encrypted scripts ===== */

        document
          .querySelectorAll("script")
          .forEach(script => {

            const code =
              script.innerHTML || "";

            if (
              code.length > 500000
            ) {
              script.remove();
            }

          });

        /* ===== clean nonce attrs ===== */

        document
          .querySelectorAll("*")
          .forEach(el => {

            [...el.attributes]
            .forEach(attr => {

              if (
                attr.name.toLowerCase() ===
                "nonce"
              ) {

                el.removeAttribute(
                  attr.name
                );
              }

            });

          });

        /* ===== captured runtime scripts ===== */

        const capturedScripts =
          window.__shadow_scripts
          .join("\n\n");

        /* ===== FINAL OUTPUT ===== */

        return `
<!DOCTYPE html>

${document.documentElement.outerHTML}

<!-- SHADOW RUNTIME SCRIPTS -->

${capturedScripts}

        `.trim();

      });

    fs.writeFileSync(
      outputPath,
      finalHTML,
      "utf8"
    );

  }

  finally {

    await browser.close();

  }
}

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

      /* ===== START ===== */

      if (
        message.text === "/start"
      ) {

        await sendMessage(

          chatId,

`🔥 <b>SHADOWDECRYPT BOT</b>

✅ Full HTML
✅ Full CSS
✅ Runtime JavaScript
✅ Dynamic Scripts
✅ Eval Capture
✅ DOM Render

Send encrypted HTML file.`

        );

        return res.sendStatus(200);
      }

      /* ===== REQUIRE DOCUMENT ===== */

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
        `downloads/${Date.now()}_${fileName}`;

      const outputPath =
        `output/decrypted_${Date.now()}_${fileName}`;

      /* ===== DOWNLOAD ===== */

      await sendMessage(
        chatId,
        "📥 Downloading HTML..."
      );

      await downloadTelegramFile(
        fileId,
        inputPath
      );

      /* ===== EXECUTE ===== */

      await sendMessage(
        chatId,
        "⚡ Executing encrypted JavaScript..."
      );

      await decryptHTML(
        inputPath,
        outputPath
      );

      /* ===== SEND RESULT ===== */

      await sendDocument(
        chatId,
        outputPath,
        "✅ HTML Decrypted Successfully"
      );

      /* ===== CLEANUP ===== */

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

    catch(err) {

      console.error(err);

      return res.sendStatus(500);
    }
  }
);

/* ================= START SERVER ================= */

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `Server running on ${PORT}`
  );

});
