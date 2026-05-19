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
});        "parse_mode" => "HTML",
        "document"   => new CURLFile(realpath($filePath)),
    ]);
}

/* ================= DOWNLOAD FILE ================= */

function downloadTelegramFile($fileId) {
    $getFile = api("getFile", ["file_id" => $fileId]);
    if (!$getFile || empty($getFile["ok"])) return false;

    $filePath    = $getFile["result"]["file_path"];
    $downloadUrl = "https://api.telegram.org/file/bot" . BOT_TOKEN . "/" . $filePath;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL,            $downloadUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT,        120);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    $content  = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ($httpCode == 200 && $content !== false) ? $content : false;
}

/* ================= FIXED DECRYPTION ENGINE ================= */

function decryptHTML($content) {

    ini_set('memory_limit', '256M');
    libxml_use_internal_errors(true);

    $original = $content;

    /* ================= STEP 1 =================
       Multi-layer decoding
    */

    for ($i = 0; $i < 10; $i++) {

        // atob("...")
        if (preg_match('/atob\s*\(\s*[\'\"]([^\'\"]+)[\'\"]\s*\)/i', $content, $m)) {

            $decoded = base64_decode($m[1], true);

            if ($decoded !== false && strlen($decoded) > 10) {
                $content = $decoded;
            }
        }

        // document.write("...")
        $content = preg_replace_callback(
            '/document\.write\s*\(\s*[\'\"](.*?)[\'\"]\s*\)/is',
            function($m) {
                return html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5);
            },
            $content
        );

        // decodeURIComponent("...")
        if (preg_match('/decodeURIComponent\s*\(\s*[\'\"]([^\'\"]+)[\'\"]\s*\)/i', $content, $m)) {

            $decoded = rawurldecode($m[1]);

            if (!empty($decoded)) {
                $content = $decoded;
            }
        }

        // Full base64 HTML
        $trimmed = trim($content);

        if (
            preg_match('/^[A-Za-z0-9+\/=\s]+$/', $trimmed) &&
            strlen($trimmed) > 100
        ) {

            $decoded = base64_decode($trimmed, true);

            if ($decoded !== false && strpos($decoded, '<') !== false) {
                $content = $decoded;
            }
        }
    }

    /* ================= STEP 2 =================
       Load HTML into DOM
    */

    $dom = new DOMDocument();

    @$dom->loadHTML(
        mb_convert_encoding($content, 'HTML-ENTITIES', 'UTF-8'),
        LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
    );

    /* ================= STEP 3 =================
       Remove obfuscated scripts
    */

    $scripts = $dom->getElementsByTagName('script');

    $removeScripts = [];

    foreach ($scripts as $script) {

        $src  = strtolower($script->getAttribute('src'));
        $code = strtolower($script->nodeValue);

        if (
            strpos($code, 'eval(') !== false ||
            strpos($code, 'atob(') !== false ||
            strpos($code, 'document.write') !== false ||
            strpos($code, 'decodeuricomponent') !== false ||
            strpos($code, 'fromcharcode') !== false ||
            strpos($code, 'unescape(') !== false ||
            strpos($code, 'settimeout(') !== false ||
            strpos($src, 'googletagmanager') !== false
        ) {
            $removeScripts[] = $script;
        }
    }

    foreach ($removeScripts as $node) {

        if ($node->parentNode) {
            $node->parentNode->removeChild($node);
        }
    }

    /* ================= STEP 4 =================
       Remove hidden iframes
    */

    $iframes = $dom->getElementsByTagName('iframe');

    $removeFrames = [];

    foreach ($iframes as $iframe) {

        $style  = strtolower($iframe->getAttribute('style'));
        $width  = $iframe->getAttribute('width');
        $height = $iframe->getAttribute('height');

        if (
            strpos($style, 'display:none') !== false ||
            strpos($style, 'visibility:hidden') !== false ||
            $width == '0' ||
            $height == '0'
        ) {
            $removeFrames[] = $iframe;
        }
    }

    foreach ($removeFrames as $node) {

        if ($node->parentNode) {
            $node->parentNode->removeChild($node);
        }
    }

    /* ================= STEP 5 =================
       Remove malicious attributes
    */

    $all = $dom->getElementsByTagName('*');

    foreach ($all as $el) {

        $attrs = [];

        foreach ($el->attributes as $attr) {
            $attrs[] = $attr->name;
        }

        foreach ($attrs as $attrName) {

            if (
                stripos($attrName, 'on') === 0 ||
                strtolower($attrName) === 'nonce'
            ) {
                $el->removeAttribute($attrName);
            }
        }
    }

    /* ================= STEP 6 =================
       Generate clean HTML
    */

    $clean = $dom->saveHTML();

    // Remove empty scripts
    $clean = preg_replace(
        '/<script\b[^>]*>\s*<\/script>/i',
        '',
        $clean
    );

    // Remove XML junk
    $clean = preg_replace('/<\?xml.*?\?>/i', '', $clean);

    // Normalize spacing
    $clean = preg_replace('/\n{3,}/', "\n\n", $clean);

    libxml_clear_errors();

    if (strlen(trim($clean)) < 20) {
        return $original;
    }

    return trim($clean);
}

/* ================= MENU ================= */

function mainMenu() {
    return [
        "inline_keyboard" => [
            [["text" => "📄 Upload HTML",  "callback_data" => "upload"]],
            [["text" => "🛡 Clear Temp",   "callback_data" => "clear"]],
        ]
    ];
}

/* ================= MESSAGE HANDLER ================= */

if ($message) {
    $chatId = $message["chat"]["id"] ?? null;
    if (!$chatId) exit;

    $text = $message["text"] ?? "";

    // Save user
    if (!in_array($chatId, $users)) {
        $users[] = $chatId;
        file_put_contents("data/users.json", json_encode($users));
    }

    /* --- /start --- */
    if ($text === "/start") {
        $unlockEmoji    = premiumEmoji(EMOJI_UNLOCK);
        $checkEmoji     = premiumEmoji(EMOJI_CHECK);
        $shieldEmoji    = premiumEmoji(EMOJI_SHIELD);
        $developerEmoji = premiumEmoji(EMOJI_DEVELOPER);

        $msg = "{$unlockEmoji} <b>SHADOWDECRYPT BOT</b>\n\n"
             . "<i>Advanced HTML Decryption Bot</i>\n\n"
             . "<b>✨ Features:</b>\n"
             . "• {$checkEmoji} Multi-layer decryption\n"
             . "• {$checkEmoji} Clean HTML output\n"
             . "• {$checkEmoji} Fast processing\n"
             . "• {$shieldEmoji} No logs kept\n\n"
             . "<b>📁 How to use:</b>\n"
             . "Simply send any encrypted/obfuscated HTML file\n\n"
             . "<b>{$developerEmoji} Developer:</b> @Brokenboy46";

        sendMessage($chatId, $msg, mainMenu());
        exit;
    }

    /* --- Document handler --- */
    if (isset($message["document"])) {
        $document = $message["document"];
        $fileName = $document["file_name"]  ?? "file.html";
        $fileId   = $document["file_id"];
        $fileSize = $document["file_size"]  ?? 0;

        // Size check
        if ($fileSize > 50 * 1024 * 1024) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " File too large! Max 50 MB.");
            exit;
        }

        // Extension check
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if (!in_array($ext, ['html', 'htm'])) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " Only HTML files allowed (.html or .htm).");
            exit;
        }

        // Processing message
        $processingMsg = sendMessage($chatId, premiumEmoji(EMOJI_DOCUMENT) . " Processing file...");
        $processingId  = $processingMsg['result']['message_id'] ?? null;

        // Download
        $fileContent = downloadTelegramFile($fileId);
        if ($fileContent === false) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " Failed to download file. Please try again.");
            if ($processingId) deleteMessage($chatId, $processingId);
            exit;
        }

        // Update status
        if ($processingId) {
            editMessage($chatId, $processingId, premiumEmoji(EMOJI_UNLOCK) . " Decrypting content...");
        }

        // Decrypt
        $decryptedContent  = decryptHTML($fileContent);
        $decryptedFileName = "decrypted_" . $fileName;
        $outputFile        = "output/" . time() . "_" . preg_replace('/[^a-zA-Z0-9._-]/', '_', $decryptedFileName);

        file_put_contents($outputFile, $decryptedContent);

        // Remove processing message
        if ($processingId) deleteMessage($chatId, $processingId);

        /* -- Info message about original file -- */
        $documentEmoji  = premiumEmoji(EMOJI_DOCUMENT);
        $shieldEmoji    = premiumEmoji(EMOJI_SHIELD);
        $developerEmoji = premiumEmoji(EMOJI_DEVELOPER);
        $checkEmoji     = premiumEmoji(EMOJI_CHECK);
        $unlockEmoji    = premiumEmoji(EMOJI_UNLOCK);

        $originalMsg = "{$documentEmoji} <b>Original (Encrypted) HTML</b>\n\n"
                     . "▪️ <b>File:</b> <code>" . htmlspecialchars($fileName) . "</code>\n"
                     . "▪️ <b>Size:</b> " . round($fileSize / 1024, 2) . " KB\n"
                     . "▪️ <b>Status:</b> {$shieldEmoji} Encrypted\n"
                     . "▪️ <b>Engine:</b> ShadowDecrypt v1.0\n"
                     . "▪️ <b>{$developerEmoji} Developer:</b> @Brokenboy46";

        sendMessage($chatId, $originalMsg);

        /* -- Send decrypted file -- */
        $caption = "{$checkEmoji} <b>Decryption Complete!</b>\n\n"
                 . "{$documentEmoji} <b>File:</b> <code>" . htmlspecialchars($decryptedFileName) . "</code>\n"
                 . "{$unlockEmoji} <b>Decrypted:</b> {$checkEmoji} Done\n"
                 . "{$shieldEmoji} <b>Security:</b> {$checkEmoji} Cleaned\n\n"
                 . "{$developerEmoji} <b>Developer:</b> @Brokenboy46";

        sendDocument($chatId, $outputFile, $caption);

        // Cleanup
        if (file_exists($outputFile)) unlink($outputFile);

        exit;
    }

    /* --- Any other text --- */
    if ($text && $text !== "/start") {
        sendMessage(
            $chatId,
            premiumEmoji(EMOJI_SHIELD) . " Please send an HTML file or use /start",
            mainMenu()
        );
    }
}

/* ================= CALLBACK HANDLER ================= */

if ($callback) {
    $chatId    = $callback["message"]["chat"]["id"]  ?? null;
    $messageId = $callback["message"]["message_id"]  ?? null;
    $data      = $callback["data"]                   ?? "";

    if (!$chatId || !$messageId) exit;

    $documentEmoji = premiumEmoji(EMOJI_DOCUMENT);
    $checkEmoji    = premiumEmoji(EMOJI_CHECK);
    $shieldEmoji   = premiumEmoji(EMOJI_SHIELD);

    switch ($data) {

        case "upload":
            editMessage(
                $chatId,
                $messageId,
                "{$documentEmoji} <b>Send HTML File</b>\n\n"
                . "Send any encrypted/obfuscated HTML file.\n\n"
                . "I'll decrypt and send:\n"
                . "• {$checkEmoji} Original file info\n"
                . "• {$checkEmoji} Clean decrypted file",
                mainMenu()
            );
            break;

        case "clear":
            $cleaned = 0;
            foreach (glob("uploads/*") as $f) {
                if (is_file($f) && unlink($f)) $cleaned++;
            }
            foreach (glob("output/*") as $f) {
                if (is_file($f) && unlink($f)) $cleaned++;
            }
            editMessage(
                $chatId,
                $messageId,
                "{$shieldEmoji} <b>Temporary Files Cleared</b>\n\n"
                . "{$checkEmoji} Deleted: {$cleaned} files\n"
                . "{$checkEmoji} Space recovered",
                mainMenu()
            );
            break;
    }

    api("answerCallbackQuery", ["callback_query_id" => $callback["id"]]);
}
?>        "caption"    => $caption,
        "parse_mode" => "HTML",
        "document"   => new CURLFile(realpath($filePath)),
    ]);
}

/* ================= DOWNLOAD FILE ================= */

function downloadTelegramFile($fileId) {
    $getFile = api("getFile", ["file_id" => $fileId]);
    if (!$getFile || empty($getFile["ok"])) return false;

    $filePath    = $getFile["result"]["file_path"];
    $downloadUrl = "https://api.telegram.org/file/bot" . BOT_TOKEN . "/" . $filePath;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL,            $downloadUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT,        120);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    $content  = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ($httpCode == 200 && $content !== false) ? $content : false;
}

/* ================= DECRYPTION ENGINE ================= */

function isReadable($text) {
    $cleanText = preg_replace('/[\x00-\x1F\x7F]+/u', '', trim($text));
    return !($cleanText === "" ||
             preg_match('/(&#\d+;)|(&#x[0-9a-f]+;)/i', $cleanText) ||
             preg_match('/%[0-9a-f]{2}/i', $cleanText));
}

function getHTMLFromDOM($html) {
    // Create a DOMDocument and load the HTML
    $dom = new DOMDocument();
    @$dom->loadHTML(mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8'), LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);

    // Remove script tags (we don't want to execute them)
    $scripts = $dom->getElementsByTagName('script');
    while ($scripts->length > 0) {
        $scripts->item(0)->parentNode->removeChild($scripts->item(0));
    }

    // Process the DOM to extract clean HTML
    $output = '';
    $nodes = $dom->getElementsByTagName('body');
    if ($nodes->length > 0) {
        $body = $nodes->item(0);
        $output = processNode($body);
    }

    // Find charset meta tag
    $metas = $dom->getElementsByTagName('meta');
    $charsetFound = false;
    foreach ($metas as $meta) {
        if (strtolower($meta->getAttribute('charset')) === 'utf-8' ||
            strtolower($meta->getAttribute('http-equiv')) === 'content-type') {
            $charsetFound = true;
            break;
        }
    }

    // If no charset meta found, add one
    if (!$charsetFound) {
        $output = '<meta charset="UTF-8">' . $output;
    }

    return "<html>\n" . $output . "\n</html>";
}

function processNode($node) {
    $output = '';

    if ($node instanceof DOMElement) {
        // Element node
        $tag = $node->tagName;

        // Skip current script if it exists
        if ($tag === 'script' && $node->hasAttribute('src') &&
            strpos($node->getAttribute('src'), 'currentScript') !== false) {
            return '';
        }

        $output .= "<" . $tag;

        // Add attributes
        foreach ($node->attributes as $attr) {
            $output .= ' ' . $attr->name . '="' . htmlspecialchars($attr->value) . '"';
        }

        $output .= ">";

        // Process child nodes
        foreach ($node->childNodes as $child) {
            $output .= processNode($child);
        }

        $output .= "</" . $tag . ">";
    }
    elseif ($node instanceof DOMText) {
        // Text node
        $text = $node->nodeValue;

        // Only include text if it's readable
        if (isReadable($text)) {
            $output .= $text;
        }
    }
    elseif ($node instanceof DOMComment) {
        // Comment node
        $output .= "<!--" . $node->nodeValue . "-->";
    }

    return $output;
}

function decryptHTML($content) {
    // First try to get a DOM representation
    try {
        $decrypted = getHTMLFromDOM($content);

        // If we got something readable back, return it
        if (strlen($decrypted) > 0 && isReadable(substr($decrypted, 0, 100))) {
            return $decrypted;
        }
    } catch (Exception $e) {
        // If DOM parsing fails, fall back to simple decoding
    }

    // Fallback to simple base64 decoding if DOM parsing didn't work
    $trimmed = trim($content);
    if (preg_match('/^[A-Za-z0-9+\/=\s]+$/', $trimmed) && strlen($trimmed) > 100) {
        $decoded = base64_decode($trimmed, true);
        if ($decoded !== false) {
            return $decoded;
        }
    }

    // If all else fails, return the original content
    return $content;
}

/* ================= MENU ================= */
// NOTE: inline_keyboard button "text" is plain text only — no HTML tags
function mainMenu() {
    return [
        "inline_keyboard" => [
            [["text" => "📄 Upload HTML",  "callback_data" => "upload"]],
            [["text" => "🛡 Clear Temp",   "callback_data" => "clear"]],
        ]
    ];
}

/* ================= MESSAGE HANDLER ================= */

if ($message) {
    $chatId = $message["chat"]["id"] ?? null;
    if (!$chatId) exit;

    $text = $message["text"] ?? "";

    // Save user
    if (!in_array($chatId, $users)) {
        $users[] = $chatId;
        file_put_contents("data/users.json", json_encode($users));
    }

    /* --- /start --- */
    if ($text === "/start") {
        $unlockEmoji    = premiumEmoji(EMOJI_UNLOCK);
        $checkEmoji     = premiumEmoji(EMOJI_CHECK);
        $shieldEmoji    = premiumEmoji(EMOJI_SHIELD);
        $developerEmoji = premiumEmoji(EMOJI_DEVELOPER);

        $msg = "{$unlockEmoji} <b>SHADOWDECRYPT BOT</b>\n\n"
             . "<i>Advanced HTML Decryption Bot</i>\n\n"
             . "<b>✨ Features:</b>\n"
             . "• {$checkEmoji} Multi-layer decryption\n"
             . "• {$checkEmoji} Clean HTML output\n"
             . "• {$checkEmoji} Fast processing\n"
             . "• {$shieldEmoji} No logs kept\n\n"
             . "<b>📁 How to use:</b>\n"
             . "Simply send any encrypted/obfuscated HTML file\n\n"
             . "<b>{$developerEmoji} Developer:</b> @Brokenboy46";

        sendMessage($chatId, $msg, mainMenu());
        exit;
    }

    /* --- Document handler --- */
    if (isset($message["document"])) {
        $document = $message["document"];
        $fileName = $document["file_name"]  ?? "file.html";
        $fileId   = $document["file_id"];
        $fileSize = $document["file_size"]  ?? 0;

        // Size check
        if ($fileSize > 50 * 1024 * 1024) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " File too large! Max 50 MB.");
            exit;
        }

        // Extension check
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if (!in_array($ext, ['html', 'htm'])) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " Only HTML files allowed (.html or .htm).");
            exit;
        }

        // Processing message
        $processingMsg = sendMessage($chatId, premiumEmoji(EMOJI_DOCUMENT) . " Processing file...");
        $processingId  = $processingMsg['result']['message_id'] ?? null;

        // Download
        $fileContent = downloadTelegramFile($fileId);
        if ($fileContent === false) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " Failed to download file. Please try again.");
            if ($processingId) deleteMessage($chatId, $processingId);
            exit;
        }

        // Update status
        if ($processingId) {
            editMessage($chatId, $processingId, premiumEmoji(EMOJI_UNLOCK) . " Decrypting content...");
        }

        // Decrypt
        $decryptedContent = decryptHTML($fileContent);
        $decryptedFileName = "decrypted_" . $fileName;
        $outputFile = "output/" . time() . "_" . preg_replace('/[^a-zA-Z0-9._-]/', '_', $decryptedFileName);

        file_put_contents($outputFile, $decryptedContent);

        // Remove processing message
        if ($processingId) deleteMessage($chatId, $processingId);

        /* -- Info message about original file -- */
        $documentEmoji  = premiumEmoji(EMOJI_DOCUMENT);
        $shieldEmoji    = premiumEmoji(EMOJI_SHIELD);
        $developerEmoji = premiumEmoji(EMOJI_DEVELOPER);
        $checkEmoji     = premiumEmoji(EMOJI_CHECK);
        $unlockEmoji    = premiumEmoji(EMOJI_UNLOCK);

        $originalMsg = "{$documentEmoji} <b>Original (Encrypted) HTML</b>\n\n"
                     . "▪️ <b>File:</b> <code>" . htmlspecialchars($fileName) . "</code>\n"
                     . "▪️ <b>Size:</b> " . round($fileSize / 1024, 2) . " KB\n"
                     . "▪️ <b>Status:</b> {$shieldEmoji} Encrypted\n"
                     . "▪️ <b>Engine:</b> ShadowDecrypt v2.0\n"
                     . "▪️ <b>{$developerEmoji} Developer:</b> @Brokenboy46";

        sendMessage($chatId, $originalMsg);

        /* -- Send decrypted file -- */
        $caption = "{$checkEmoji} <b>Decryption Complete!</b>\n\n"
                 . "{$documentEmoji} <b>File:</b> <code>" . htmlspecialchars($decryptedFileName) . "</code>\n"
                 . "{$unlockEmoji} <b>Decrypted:</b> {$checkEmoji} Done\n"
                 . "{$shieldEmoji} <b>Security:</b> {$checkEmoji} Cleaned\n\n"
                 . "{$developerEmoji} <b>Developer:</b> @Brokenboy46";

        sendDocument($chatId, $outputFile, $caption);

        // Cleanup
        if (file_exists($outputFile)) unlink($outputFile);

        exit;
    }

    /* --- Any other text --- */
    if ($text && $text !== "/start") {
        sendMessage(
            $chatId,
            premiumEmoji(EMOJI_SHIELD) . " Please send an HTML file or use /start",
            mainMenu()
        );
    }
}

/* ================= CALLBACK HANDLER ================= */

if ($callback) {
    $chatId    = $callback["message"]["chat"]["id"]  ?? null;
    $messageId = $callback["message"]["message_id"]  ?? null;
    $data      = $callback["data"]                   ?? "";

    if (!$chatId || !$messageId) exit;

    $documentEmoji = premiumEmoji(EMOJI_DOCUMENT);
    $checkEmoji    = premiumEmoji(EMOJI_CHECK);
    $shieldEmoji   = premiumEmoji(EMOJI_SHIELD);

    switch ($data) {

        case "upload":
            editMessage(
                $chatId,
                $messageId,
                "{$documentEmoji} <b>Send HTML File</b>\n\n"
                . "Send any encrypted/obfuscated HTML file.\n\n"
                . "I'll decrypt and send:\n"
                . "• {$checkEmoji} Original file info\n"
                . "• {$checkEmoji} Clean decrypted file",
                mainMenu()
            );
            break;

        case "clear":
            $cleaned = 0;
            foreach (glob("uploads/*") as $f) {
                if (is_file($f) && unlink($f)) $cleaned++;
            }
            foreach (glob("output/*") as $f) {
                if (is_file($f) && unlink($f)) $cleaned++;
            }
            editMessage(
                $chatId,
                $messageId,
                "{$shieldEmoji} <b>Temporary Files Cleared</b>\n\n"
                . "{$checkEmoji} Deleted: {$cleaned} files\n"
                . "{$checkEmoji} Space recovered",
                mainMenu()
            );
            break;
    }

    api("answerCallbackQuery", ["callback_query_id" => $callback["id"]]);
}
?>        "parse_mode" => "HTML",
        "document"   => new CURLFile(realpath($filePath)),
    ]);
}

/* ================= DOWNLOAD FILE ================= */

function downloadTelegramFile($fileId) {
    $getFile = api("getFile", ["file_id" => $fileId]);
    if (!$getFile || empty($getFile["ok"])) return false;

    $filePath    = $getFile["result"]["file_path"];
    $downloadUrl = "https://api.telegram.org/file/bot" . BOT_TOKEN . "/" . $filePath;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL,            $downloadUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT,        120);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    $content  = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ($httpCode == 200 && $content !== false) ? $content : false;
}

/* ================= DECRYPTION ENGINE (SERVER-SIDE ADAPTATION) ================= */
// Translated from your JS DOM traversal logic. UI/Clipboard/Download buttons removed.
// Runs purely on PHP DOMDocument to filter obfuscated text nodes & reconstruct clean HTML.

function decryptHTML($content) {
    // Suppress warnings from malformed HTML
    libxml_use_internal_errors(true);
    
    $dom = new DOMDocument();
    // UTF-8 encoding hint for DOMDocument
    $dom->loadHTML('<?xml encoding="UTF-8">' . $content, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();

    // Recursive serializer mirroring your JS getHTMLFromDOM()
    $serialize = function($node) use (&$serialize) {
        $html = '';
        
        if ($node->nodeType === XML_ELEMENT_NODE) {
            $tag = strtolower($node->nodeName);
            $html .= '<' . $tag;
            
            if ($node->hasAttributes()) {
                foreach ($node->attributes as $attr) {
                    $html .= ' ' . $attr->nodeName . '="' . htmlspecialchars($attr->nodeValue, ENT_QUOTES, 'UTF-8') . '"';
                }
            }
            $html .= '>';
            
            if ($node->hasChildNodes()) {
                foreach ($node->childNodes as $child) {
                    $html .= $serialize($child);
                }
            }
            // JS always appends closing tags, so we do the same for 1:1 parity
            $html .= '</' . $tag . '>';
            
        } elseif ($node->nodeType === XML_TEXT_NODE) {
            $parentTag = $node->parentNode ? strtolower($node->parentNode->nodeName) : '';
            
            if ($parentTag === 'script') {
                // Keep script content exactly as-is
                $html .= $node->nodeValue;
            } else {
                // isReadable() logic adapted from JS
                $clean = preg_replace('/[\x00-\x1F\x7F]+/', '', $node->nodeValue);
                $clean = trim($clean);
                
                $isReadable = !(
                    $clean === '' || 
                    preg_match('/(&#\d+;)|(&#x[0-9a-fA-F]+;)/i', $clean) || 
                    preg_match('/%[0-9a-fA-F]{2}/i', $clean)
                );
                
                if ($isReadable) {
                    $html .= $node->nodeValue;
                }
            }
        } elseif ($node->nodeType === XML_COMMENT_NODE) {
            $html .= '<!--' . $node->nodeValue . '-->';
        }
        
        return $html;
    };

    $sourceCode = '';
    if ($dom->documentElement) {
        $sourceCode = $serialize($dom->documentElement);
    }

    // Truncate everything before <meta charset="UTF-8" (case-insensitive for safety)
    $startIndex = stripos($sourceCode, '<meta charset="UTF-8"');
    if ($startIndex !== false) {
        $sourceCode = substr($sourceCode, $startIndex);
    }

    // Wrap exactly as your JS does
    return "<html>\n" . $sourceCode . "\n</html>";
}

/* ================= MENU ================= */
function mainMenu() {
    return [
        "inline_keyboard" => [
            [["text" => "📄 Upload HTML",  "callback_data" => "upload"]],
            [["text" => "🛡 Clear Temp",   "callback_data" => "clear"]],
        ]
    ];
}

/* ================= MESSAGE HANDLER ================= */

if ($message) {
    $chatId = $message["chat"]["id"] ?? null;
    if (!$chatId) exit;

    $text = $message["text"] ?? "";

    // Save user
    if (!in_array($chatId, $users)) {
        $users[] = $chatId;
        file_put_contents("data/users.json", json_encode($users));
    }

    /* --- /start --- */
    if ($text === "/start") {
        $unlockEmoji    = premiumEmoji(EMOJI_UNLOCK);
        $checkEmoji     = premiumEmoji(EMOJI_CHECK);
        $shieldEmoji    = premiumEmoji(EMOJI_SHIELD);
        $developerEmoji = premiumEmoji(EMOJI_DEVELOPER);

        $msg = "{$unlockEmoji} <b>SHADOWDECRYPT BOT</b>\n\n"
             . "<i>Advanced HTML Decryption Bot</i>\n\n"
             . "<b>✨ Features:</b>\n"
             . "• {$checkEmoji} Multi-layer decryption\n"
             . "• {$checkEmoji} Clean HTML output\n"
             . "• {$checkEmoji} Fast processing\n"
             . "• {$shieldEmoji} No logs kept\n\n"
             . "<b>📁 How to use:</b>\n"
             . "Simply send any encrypted/obfuscated HTML file\n\n"
             . "<b>{$developerEmoji} Developer:</b> @Brokenboy46";

        sendMessage($chatId, $msg, mainMenu());
        exit;
    }

    /* --- Document handler --- */
    if (isset($message["document"])) {
        $document = $message["document"];
        $fileName = $document["file_name"]  ?? "file.html";
        $fileId   = $document["file_id"];
        $fileSize = $document["file_size"]  ?? 0;

        if ($fileSize > 50 * 1024 * 1024) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " File too large! Max 50 MB.");
            exit;
        }

        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if (!in_array($ext, ['html', 'htm'])) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " Only HTML files allowed (.html or .htm).");
            exit;
        }

        $processingMsg = sendMessage($chatId, premiumEmoji(EMOJI_DOCUMENT) . " Processing file...");
        $processingId  = $processingMsg['result']['message_id'] ?? null;

        $fileContent = downloadTelegramFile($fileId);
        if ($fileContent === false) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " Failed to download file. Please try again.");
            if ($processingId) deleteMessage($chatId, $processingId);
            exit;
        }

        if ($processingId) {
            editMessage($chatId, $processingId, premiumEmoji(EMOJI_UNLOCK) . " Decrypting content...");
        }

        $decryptedContent  = decryptHTML($fileContent);
        $decryptedFileName = "decrypted_" . $fileName;
        $outputFile        = "output/" . time() . "_" . preg_replace('/[^a-zA-Z0-9._-]/', '_', $decryptedFileName);

        file_put_contents($outputFile, $decryptedContent);

        if ($processingId) deleteMessage($chatId, $processingId);

        $documentEmoji  = premiumEmoji(EMOJI_DOCUMENT);
        $shieldEmoji    = premiumEmoji(EMOJI_SHIELD);
        $developerEmoji = premiumEmoji(EMOJI_DEVELOPER);
        $checkEmoji     = premiumEmoji(EMOJI_CHECK);
        $unlockEmoji    = premiumEmoji(EMOJI_UNLOCK);

        $originalMsg = "{$documentEmoji} <b>Original (Encrypted) HTML</b>\n\n"
                     . "▪️ <b>File:</b> <code>" . htmlspecialchars($fileName) . "</code>\n"
                     . "▪️ <b>Size:</b> " . round($fileSize / 1024, 2) . " KB\n"
                     . "▪️ <b>Status:</b> {$shieldEmoji} Encrypted\n"
                     . "▪️ <b>Engine:</b> ShadowDecrypt v2.0 (DOM Filter)\n"
                     . "▪️ <b>{$developerEmoji} Developer:</b> @Brokenboy46";

        sendMessage($chatId, $originalMsg);

        $caption = "{$checkEmoji} <b>Decryption Complete!</b>\n\n"
                 . "{$documentEmoji} <b>File:</b> <code>" . htmlspecialchars($decryptedFileName) . "</code>\n"
                 . "{$unlockEmoji} <b>Decrypted:</b> {$checkEmoji} Done\n"
                 . "{$shieldEmoji} <b>Security:</b> {$checkEmoji} Cleaned\n\n"
                 . "{$developerEmoji} <b>Developer:</b> @Brokenboy46";

        sendDocument($chatId, $outputFile, $caption);

        if (file_exists($outputFile)) unlink($outputFile);
        exit;
    }

    /* --- Any other text --- */
    if ($text && $text !== "/start") {
        sendMessage(
            $chatId,
            premiumEmoji(EMOJI_SHIELD) . " Please send an HTML file or use /start",
            mainMenu()
        );
    }
}

/* ================= CALLBACK HANDLER ================= */

if ($callback) {
    $chatId    = $callback["message"]["chat"]["id"]  ?? null;
    $messageId = $callback["message"]["message_id"]  ?? null;
    $data      = $callback["data"]                   ?? "";

    if (!$chatId || !$messageId) exit;

    $documentEmoji = premiumEmoji(EMOJI_DOCUMENT);
    $checkEmoji    = premiumEmoji(EMOJI_CHECK);
    $shieldEmoji   = premiumEmoji(EMOJI_SHIELD);

    switch ($data) {
        case "upload":
            editMessage(
                $chatId,
                $messageId,
                "{$documentEmoji} <b>Send HTML File</b>\n\n"
                . "Send any encrypted/obfuscated HTML file.\n\n"
                . "I'll decrypt and send:\n"
                . "• {$checkEmoji} Original file info\n"
                . "• {$checkEmoji} Clean decrypted file",
                mainMenu()
            );
            break;

        case "clear":
            $cleaned = 0;
            foreach (glob("uploads/*") as $f) {
                if (is_file($f) && unlink($f)) $cleaned++;
            }
            foreach (glob("output/*") as $f) {
                if (is_file($f) && unlink($f)) $cleaned++;
            }
            editMessage(
                $chatId,
                $messageId,
                "{$shieldEmoji} <b>Temporary Files Cleared</b>\n\n"
                . "{$checkEmoji} Deleted: {$cleaned} files\n"
                . "{$checkEmoji} Space recovered",
                mainMenu()
            );
            break;
    }

    api("answerCallbackQuery", ["callback_query_id" => $callback["id"]]);
}
?>        "caption"    => $caption,
        "parse_mode" => "HTML",
        "document"   => new CURLFile(realpath($filePath)),
    ]);
}

/* ================= DOWNLOAD FILE ================= */

function downloadTelegramFile($fileId) {
    $getFile = api("getFile", ["file_id" => $fileId]);
    if (!$getFile || empty($getFile["ok"])) return false;

    $filePath    = $getFile["result"]["file_path"];
    $downloadUrl = "https://api.telegram.org/file/bot" . BOT_TOKEN . "/" . $filePath;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL,            $downloadUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT,        120);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    $content  = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ($httpCode == 200 && $content !== false) ? $content : false;
}

/* ================= DECRYPTION ENGINE ================= */

function decryptHTML($content) {
    // Layer 1: document.write(decodeURIComponent(escape(atob('...'))))
    if (preg_match(
        '/document\.write\s*\(\s*decodeURIComponent\s*\(\s*escape\s*\(\s*atob\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*\)\s*\)\s*\)/i',
        $content, $matches
    )) {
        $decoded = base64_decode($matches[1]);
        if ($decoded !== false) {
            $content = rawurldecode($decoded);
        }
    }

    // Layer 2: plain base64 blob that looks like HTML
    $trimmed = trim($content);
    if (preg_match('/^[A-Za-z0-9+\/=\s]+$/', $trimmed) && strlen($trimmed) > 100) {
        $decoded = base64_decode($trimmed, true);
        if ($decoded !== false && strpos($decoded, '<') !== false) {
            $content = $decoded;
        }
    }

    // Layer 3: simple document.write('...')
    $content = preg_replace_callback(
        '/document\.write\s*\(\s*["\']([^"\']+)["\']\s*\)/i',
        function($m) { return $m[1]; },
        $content
    );

    return $content;
}

/* ================= MENU ================= */
// NOTE: inline_keyboard button "text" is plain text only — no HTML tags
function mainMenu() {
    return [
        "inline_keyboard" => [
            [["text" => "📄 Upload HTML",  "callback_data" => "upload"]],
            [["text" => "🛡 Clear Temp",   "callback_data" => "clear"]],
        ]
    ];
}

/* ================= MESSAGE HANDLER ================= */

if ($message) {
    $chatId = $message["chat"]["id"] ?? null;
    if (!$chatId) exit;

    $text = $message["text"] ?? "";

    // Save user
    if (!in_array($chatId, $users)) {
        $users[] = $chatId;
        file_put_contents("data/users.json", json_encode($users));
    }

    /* --- /start --- */
    if ($text === "/start") {
        $unlockEmoji    = premiumEmoji(EMOJI_UNLOCK);
        $checkEmoji     = premiumEmoji(EMOJI_CHECK);
        $shieldEmoji    = premiumEmoji(EMOJI_SHIELD);
        $developerEmoji = premiumEmoji(EMOJI_DEVELOPER);

        $msg = "{$unlockEmoji} <b>SHADOWDECRYPT BOT</b>\n\n"
             . "<i>Advanced HTML Decryption Bot</i>\n\n"
             . "<b>✨ Features:</b>\n"
             . "• {$checkEmoji} Multi-layer decryption\n"
             . "• {$checkEmoji} Clean HTML output\n"
             . "• {$checkEmoji} Fast processing\n"
             . "• {$shieldEmoji} No logs kept\n\n"
             . "<b>📁 How to use:</b>\n"
             . "Simply send any encrypted/obfuscated HTML file\n\n"
             . "<b>{$developerEmoji} Developer:</b> @Brokenboy46";

        sendMessage($chatId, $msg, mainMenu());
        exit;
    }

    /* --- Document handler --- */
    if (isset($message["document"])) {
        $document = $message["document"];
        $fileName = $document["file_name"]  ?? "file.html";
        $fileId   = $document["file_id"];
        $fileSize = $document["file_size"]  ?? 0;

        // Size check
        if ($fileSize > 50 * 1024 * 1024) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " File too large! Max 50 MB.");
            exit;
        }

        // Extension check
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if (!in_array($ext, ['html', 'htm'])) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " Only HTML files allowed (.html or .htm).");
            exit;
        }

        // Processing message
        $processingMsg = sendMessage($chatId, premiumEmoji(EMOJI_DOCUMENT) . " Processing file...");
        $processingId  = $processingMsg['result']['message_id'] ?? null;

        // Download
        $fileContent = downloadTelegramFile($fileId);
        if ($fileContent === false) {
            sendMessage($chatId, premiumEmoji(EMOJI_SHIELD) . " Failed to download file. Please try again.");
            if ($processingId) deleteMessage($chatId, $processingId);
            exit;
        }

        // Update status
        if ($processingId) {
            editMessage($chatId, $processingId, premiumEmoji(EMOJI_UNLOCK) . " Decrypting content...");
        }

        // Decrypt
        $decryptedContent  = decryptHTML($fileContent);
        $decryptedFileName = "decrypted_" . $fileName;
        $outputFile        = "output/" . time() . "_" . preg_replace('/[^a-zA-Z0-9._-]/', '_', $decryptedFileName);

        file_put_contents($outputFile, $decryptedContent);

        // Remove processing message
        if ($processingId) deleteMessage($chatId, $processingId);

        /* -- Info message about original file -- */
        $documentEmoji  = premiumEmoji(EMOJI_DOCUMENT);
        $shieldEmoji    = premiumEmoji(EMOJI_SHIELD);
        $developerEmoji = premiumEmoji(EMOJI_DEVELOPER);
        $checkEmoji     = premiumEmoji(EMOJI_CHECK);
        $unlockEmoji    = premiumEmoji(EMOJI_UNLOCK);

        $originalMsg = "{$documentEmoji} <b>Original (Encrypted) HTML</b>\n\n"
                     . "▪️ <b>File:</b> <code>" . htmlspecialchars($fileName) . "</code>\n"
                     . "▪️ <b>Size:</b> " . round($fileSize / 1024, 2) . " KB\n"
                     . "▪️ <b>Status:</b> {$shieldEmoji} Encrypted\n"
                     . "▪️ <b>Engine:</b> ShadowDecrypt v1.0\n"
                     . "▪️ <b>{$developerEmoji} Developer:</b> @Brokenboy46";

        sendMessage($chatId, $originalMsg);

        /* -- Send decrypted file -- */
        $caption = "{$checkEmoji} <b>Decryption Complete!</b>\n\n"
                 . "{$documentEmoji} <b>File:</b> <code>" . htmlspecialchars($decryptedFileName) . "</code>\n"
                 . "{$unlockEmoji} <b>Decrypted:</b> {$checkEmoji} Done\n"
                 . "{$shieldEmoji} <b>Security:</b> {$checkEmoji} Cleaned\n\n"
                 . "{$developerEmoji} <b>Developer:</b> @Brokenboy46";

        sendDocument($chatId, $outputFile, $caption);

        // Cleanup
        if (file_exists($outputFile)) unlink($outputFile);

        exit;
    }

    /* --- Any other text --- */
    if ($text && $text !== "/start") {
        sendMessage(
            $chatId,
            premiumEmoji(EMOJI_SHIELD) . " Please send an HTML file or use /start",
            mainMenu()
        );
    }
}

/* ================= CALLBACK HANDLER ================= */

if ($callback) {
    $chatId    = $callback["message"]["chat"]["id"]  ?? null;
    $messageId = $callback["message"]["message_id"]  ?? null;
    $data      = $callback["data"]                   ?? "";

    if (!$chatId || !$messageId) exit;

    $documentEmoji = premiumEmoji(EMOJI_DOCUMENT);
    $checkEmoji    = premiumEmoji(EMOJI_CHECK);
    $shieldEmoji   = premiumEmoji(EMOJI_SHIELD);

    switch ($data) {

        case "upload":
            editMessage(
                $chatId,
                $messageId,
                "{$documentEmoji} <b>Send HTML File</b>\n\n"
                . "Send any encrypted/obfuscated HTML file.\n\n"
                . "I'll decrypt and send:\n"
                . "• {$checkEmoji} Original file info\n"
                . "• {$checkEmoji} Clean decrypted file",
                mainMenu()
            );
            break;

        case "clear":
            $cleaned = 0;
            foreach (glob("uploads/*") as $f) {
                if (is_file($f) && unlink($f)) $cleaned++;
            }
            foreach (glob("output/*") as $f) {
                if (is_file($f) && unlink($f)) $cleaned++;
            }
            editMessage(
                $chatId,
                $messageId,
                "{$shieldEmoji} <b>Temporary Files Cleared</b>\n\n"
                . "{$checkEmoji} Deleted: {$cleaned} files\n"
                . "{$checkEmoji} Space recovered",
                mainMenu()
            );
            break;
    }

    api("answerCallbackQuery", ["callback_query_id" => $callback["id"]]);
}
?>
