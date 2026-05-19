<?php

error_reporting(E_ALL);
ini_set('display_errors', 1);

date_default_timezone_set("Asia/Kolkata");

/* ================= CONFIG ================= */

define("BOT_TOKEN", "8720276947:AAGaHEbvGt-V1-J3WKFZnDkP6rQBG1oaAVI");
define("API_URL", "https://api.telegram.org/bot" . BOT_TOKEN . "/");

/* ================= PREMIUM EMOJIS ================= */
define("EMOJI_UNLOCK",    "5890882606668452641");
define("EMOJI_CHECK",     "6113924871144605986");
define("EMOJI_SHIELD",    "4958900559139570572");
define("EMOJI_DOCUMENT",  "5251276970301335582");
define("EMOJI_DEVELOPER", "6113971389935391397");

function premiumEmoji($emojiId) {
    return "<tg-emoji emoji-id=\"{$emojiId}\">⭐</tg-emoji>";
}

/* ================= FOLDERS ================= */

if (!is_dir("data"))    mkdir("data",    0777, true);
if (!is_dir("uploads")) mkdir("uploads", 0777, true);
if (!is_dir("output"))  mkdir("output",  0777, true);

/* ================= DATABASE ================= */

$dbFile = "data/users.json";
if (!file_exists($dbFile)) {
    file_put_contents($dbFile, json_encode([]));
}
$users = json_decode(file_get_contents($dbFile), true);
if (!is_array($users)) $users = [];

/* ================= UPDATE ================= */

$rawInput = file_get_contents("php://input");
$update   = json_decode($rawInput, true);

if (!is_array($update) || (isset($update["ok"]) && isset($update["result"]))) {
    // Not a valid webhook update
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        echo "✅ SHADOWDECRYPT BOT - ONLINE\n";
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        echo "👨‍💻 Developer: @Brokenboy46\n";
        echo "📊 Users: " . count($users) . "\n";
        echo "🕐 Status: ONLINE - " . date("Y-m-d H:i:s") . "\n";
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    }
    exit;
}

$message  = $update["message"]        ?? null;
$callback = $update["callback_query"] ?? null;

/* ================= API FUNCTIONS ================= */

function api($method, $data = []) {
    $url = API_URL . $method;
    $ch  = curl_init();
    curl_setopt($ch, CURLOPT_URL,            $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST,           true);
    curl_setopt($ch, CURLOPT_POSTFIELDS,     $data);
    curl_setopt($ch, CURLOPT_TIMEOUT,        60);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true);
}

function sendMessage($chatId, $text, $keyboard = null) {
    $data = [
        "chat_id"    => $chatId,
        "text"       => $text,
        "parse_mode" => "HTML",
    ];
    if ($keyboard) {
        $data["reply_markup"] = json_encode($keyboard);
    }
    return api("sendMessage", $data);
}

function editMessage($chatId, $messageId, $text, $keyboard = null) {
    $data = [
        "chat_id"    => $chatId,
        "message_id" => $messageId,
        "text"       => $text,
        "parse_mode" => "HTML",
    ];
    if ($keyboard) {
        $data["reply_markup"] = json_encode($keyboard);
    }
    return api("editMessageText", $data);
}

function deleteMessage($chatId, $messageId) {
    return api("deleteMessage", ["chat_id" => $chatId, "message_id" => $messageId]);
}

function sendDocument($chatId, $filePath, $caption = "") {
    if (!file_exists($filePath)) return false;
    return api("sendDocument", [
        "chat_id"    => $chatId,
        "caption"    => $caption,
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