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

/* ================= YOUR DECRYPTOR SCRIPT ================= */

const DECRYPT_SCRIPT = `
<script>
(function() {

    function isReadable(text) {

        const cleanText =
            text.replace(/[\\x00-\\x1F\\x7F]+/g, '').trim();

        return !(
            cleanText === "" ||
            /(&#\\d+;)|(&#x[0-9a-f]+;)/i.test(cleanText) ||
            /%[0-9a-f]{2}/i.test(cleanText)
        );
    }

    function getHTMLFromDOM(node) {

        let html = "";

        switch (node.nodeType) {

            case Node.ELEMENT_NODE:

                if (node === document.currentScript)
                    return "";

                let tag =
                    node.tagName.toLowerCase();

                html += "<" + tag;

                for (let attr of node.attributes) {

                    html +=
                        \` \${attr.name}="\${attr.value}"\`;
                }

                html += ">";

                for (let child of node.childNodes) {

                    html += getHTMLFromDOM(child);
                }

                html += \`</\${tag}>\`;

                break;

            case Node.TEXT_NODE:

                if (
                    node.parentElement &&
                    node.parentElement.tagName.toLowerCase() === "script"
                ) {

                    html += node.nodeValue;
                }

                else if (
                    isReadable(node.nodeValue)
                ) {

                    html += node.nodeValue;
                }

                break;

            case Node.COMMENT_NODE:

                html +=
                    \`<!--\${node.nodeValue}-->\`;

                break;
        }

        return html;
    }

    let sourceCode =
        getHTMLFromDOM(document.documentElement);

    let startIndex =
        sourceCode.indexOf('<meta charset="UTF-8"');

    if (startIndex !== -1) {

        sourceCode =
            sourceCode.substring(startIndex);
    }

    let finalText =
        "<html>\\n" +
        sourceCode +
        "\\n</html>";

    document.body.innerHTML =
        '<pre id="shadow-output"></pre>';

    document
        .getElementById("shadow-output")
        .innerText = finalText;

})();
</script>
`;

/* ================= DECRYPT HTML ================= */

async function decryptHTML(
  inputPath,
  outputPath
) {

  // append decryptor script
  const originalHTML =
    fs.readFileSync(inputPath, "utf8");

  const modifiedHTML =
    originalHTML + DECRYPT_SCRIPT;

  const tempPath =
    inputPath + "_modified.html";

  fs.writeFileSync(
    tempPath,
    modifiedHTML,
    "utf8"
  );

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

    await page.goto(

      `file://${path.resolve(tempPath)}`,

      {
        waitUntil: "networkidle2",
        timeout: 0
      }
    );

    // wait for decryptor script
    await new Promise(resolve =>
      setTimeout(resolve, 8000)
    );

    // extract final decrypted html
    const decryptedHTML =
      await page.evaluate(() => {

        const pre =
          document.querySelector(
            "#shadow-output"
          );

        return pre
          ? pre.innerText
          : document.documentElement.outerHTML;
      });

    fs.writeFileSync(
      outputPath,
      decryptedHTML,
      "utf8"
    );

    // cleanup temp
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

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

`🔥 SHADOWDECRYPT BOT

Send encrypted HTML file.`

        );

        return res.sendStatus(200);
      }

      /* ===== REQUIRE FILE ===== */

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
        "⚡ Decrypting HTML..."
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
    \`Server running on port \${PORT}\`
  );

});
