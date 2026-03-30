import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { maybeShowApiKeyBanner } from "./gemini-api-banner";
import "./style.css";

// 🔥 FILL THIS OUT FIRST! 🔥
// 🔥 GET YOUR GEMINI API KEY AT 🔥
// 🔥 https://g.co/ai/idxGetGeminiKey 🔥
let API_KEYS = [
  import.meta.env.VITE_GEMINI_API_KEY,
  import.meta.env.VITE_GEMINI_API_KEY_2,
  import.meta.env.VITE_GEMINI_API_KEY_3,
  import.meta.env.VITE_GEMINI_API_KEY_4,
  import.meta.env.VITE_GEMINI_API_KEY_5,
  import.meta.env.VITE_GEMINI_API_KEY_6,
  import.meta.env.VITE_GEMINI_API_KEY_7,
  import.meta.env.VITE_GEMINI_API_KEY_8,
  import.meta.env.VITE_GEMINI_API_KEY_9,
  import.meta.env.VITE_GEMINI_API_KEY_10,
].filter((key) => key); // Filter out any undefined or empty keys

// Model yang digunakan: gemma-3-27b-it (multimodal, limit gratis besar & refresh cepat)
const MODEL_NAME = "gemma-3-27b-it";

console.log("🚀 Starting Phone Scanner App...");
console.log("API Keys found:", API_KEYS.length);
console.log("Model:", MODEL_NAME);

if (API_KEYS.length === 0) {
  console.error("❌ No API keys found in environment variables");
  document.addEventListener("DOMContentLoaded", () => {
    const output = document.querySelector(".output");
    if (output) {
      output.innerHTML =
        '<p style="color: red;">Error: No API keys configured. Please check your environment variables.</p>';
    }
  });
}

let currentApiKeyIndex = 0;
let apiKeyUsageCount = {}; // Track usage count for each API key
let apiKeyErrors = {}; // Track errors for each API key
let apiKeyLimitStatus = {}; // Track if API key is currently at limit

// Initialize API key tracking
API_KEYS.forEach((key, index) => {
  apiKeyUsageCount[key] = 0;
  apiKeyErrors[key] = 0;
  apiKeyLimitStatus[index] = false; // false = available, true = at limit
});

function getCurrentApiKey() {
  return API_KEYS[currentApiKeyIndex];
}

function getNextAvailableApiKey() {
  const startIndex = currentApiKeyIndex;
  for (let i = 0; i < API_KEYS.length; i++) {
    const checkIndex = (startIndex + i) % API_KEYS.length;
    if (!apiKeyLimitStatus[checkIndex]) {
      currentApiKeyIndex = checkIndex;
      console.log(`✅ Menggunakan API Key ${currentApiKeyIndex + 1}/${API_KEYS.length}`);
      return API_KEYS[currentApiKeyIndex];
    }
  }
  return null;
}

function markApiKeyAsLimit(apiKey) {
  const keyIndex = API_KEYS.indexOf(apiKey);
  if (keyIndex !== -1) {
    apiKeyLimitStatus[keyIndex] = true;
    console.log(`⚠️ API Key ${keyIndex + 1} ditandai sebagai limit`);
  }
}

function resetAllApiKeyLimits() {
  API_KEYS.forEach((key, index) => {
    apiKeyLimitStatus[index] = false;
  });
  console.log("🔄 Semua status limit API key direset");
}

function rotateApiKey() {
  markApiKeyAsLimit(API_KEYS[currentApiKeyIndex]);
  return getNextAvailableApiKey();
}

// Helper functions
function getMimeTypeByExtension(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "application/octet-stream";
}

function isImageFile(file) {
  if (file && file.type && file.type.startsWith("image/")) return true;
  const name = (file?.name || "").toLowerCase();
  return (
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".webp") ||
    name.endsWith(".gif") ||
    name.endsWith(".bmp")
  );
}

function isRarFile(file) {
  const name = (file?.name || "").toLowerCase();
  return (
    name.endsWith(".rar") ||
    file.type === "application/vnd.rar" ||
    file.type === "application/x-rar-compressed"
  );
}

function isZipFile(file) {
  const name = (file?.name || "").toLowerCase();
  return name.endsWith(".zip") || file.type === "application/zip";
}

// ZIP extraction using JSZip
async function extractZipFile(zipFile, output) {
  try {
    console.log(`📦 Starting ZIP extraction: ${zipFile.name}`);

    if (output) {
      output.innerHTML = `
        <div style="background-color: #fff3e0; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #ff9800;">
          <div style="color: #e65100; font-weight: bold; margin-bottom: 8px;">
            📦 Mengekstrak ZIP: ${zipFile.name}
          </div>
          <div style="font-size: 14px; color: #666;">
            Sedang memuat library JSZip...
          </div>
          <div style="margin-top: 8px;">
            <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #ff9800; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          </div>
        </div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      `;
    }

    if (!window.JSZip) {
      console.log("📚 Loading JSZip...");
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      console.log("✅ JSZip loaded successfully");
    }

    const JSZip = window.JSZip;
    const zip = new JSZip();

    if (output) {
      output.innerHTML = `
        <div style="background-color: #fff3e0; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #ff9800;">
          <div style="color: #e65100; font-weight: bold; margin-bottom: 8px;">
            📦 Membaca ZIP: ${zipFile.name}
          </div>
          <div style="font-size: 14px; color: #666;">
            Menganalisis isi file...
          </div>
        </div>
      `;
    }

    const buffer = await zipFile.arrayBuffer();
    const loadedZip = await zip.loadAsync(buffer);

    const extractedImages = [];
    const imageFiles = [];

    loadedZip.forEach((relativePath, file) => {
      const name = relativePath.toLowerCase();
      if (
        !file.dir &&
        (name.endsWith(".jpg") ||
          name.endsWith(".jpeg") ||
          name.endsWith(".png") ||
          name.endsWith(".webp") ||
          name.endsWith(".gif") ||
          name.endsWith(".bmp"))
      ) {
        imageFiles.push({ path: relativePath, file: file });
      }
    });

    console.log(`📋 Found ${imageFiles.length} image files in ZIP`);

    if (imageFiles.length === 0) {
      if (output) {
        output.innerHTML = `
          <div style="background-color: #ffebee; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #f44336;">
            <div style="color: #c62828; font-weight: bold; margin-bottom: 8px;">
              ⚠️ Tidak ada gambar ditemukan dalam ZIP: ${zipFile.name}
            </div>
          </div>
        `;
      }
      return [];
    }

    for (let i = 0; i < imageFiles.length; i++) {
      const { path, file } = imageFiles[i];
      try {
        if (output) {
          const progress = Math.round(((i + 1) / imageFiles.length) * 100);
          output.innerHTML = `
            <div style="background-color: #e8f5e8; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #4caf50;">
              <div style="color: #2e7d32; font-weight: bold; margin-bottom: 8px;">
                📂 Mengekstrak ZIP: ${zipFile.name}
              </div>
              <div style="font-size: 14px; color: #666; margin-bottom: 8px;">
                Progress: ${i + 1}/${imageFiles.length} files (${progress}%)
              </div>
              <div style="width: 100%; background-color: #e0e0e0; border-radius: 4px; margin-top: 8px;">
                <div style="width: ${progress}%; height: 6px; background-color: #4caf50; border-radius: 4px; transition: width 0.3s ease;"></div>
              </div>
            </div>
          `;
        }

        const data = await file.async("uint8array");
        const mimeType = getMimeTypeByExtension(path);
        const blob = new Blob([data], { type: mimeType });
        const imageFile = new File([blob], path.split("/").pop(), {
          type: mimeType,
          lastModified: Date.now(),
        });

        extractedImages.push(imageFile);
        console.log(`✅ Successfully extracted: ${path}`);
      } catch (extractError) {
        console.error(`❌ Error extracting ${path}:`, extractError);
      }
    }

    console.log(`🎉 ZIP extraction completed: ${extractedImages.length} images extracted`);

    if (output) {
      output.innerHTML = `
        <div style="background-color: #e8f5e8; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #4caf50;">
          <div style="color: #2e7d32; font-weight: bold; margin-bottom: 8px;">
            ✅ ZIP ekstraksi selesai: ${zipFile.name}
          </div>
          <div style="font-size: 14px; color: #666;">
            Berhasil mengekstrak ${extractedImages.length} gambar
          </div>
        </div>
      `;
    }

    return extractedImages;
  } catch (error) {
    console.error("💥 ZIP extraction failed:", error);
    if (output) {
      output.innerHTML = `
        <div style="background-color: #ffebee; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #f44336;">
          <div style="color: #c62828; font-weight: bold; margin-bottom: 8px;">
            ❌ Gagal mengekstrak ZIP: ${zipFile.name}
          </div>
          <div style="font-size: 14px; color: #666;">
            Error: ${error.message}
          </div>
        </div>
      `;
    }
    return [];
  }
}

// RAR extraction (simplified)
async function extractRarFile(rarFile, output) {
  if (output) {
    output.innerHTML = `
      <div style="background-color: #fff3e0; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #ff9800;">
        <div style="color: #e65100; font-weight: bold; margin-bottom: 8px;">
          ⚠️ RAR extraction masih dalam pengembangan
        </div>
        <div style="font-size: 14px; color: #666;">
          Untuk hasil terbaik, gunakan file ZIP atau ekstrak RAR secara manual lalu upload gambar langsung.
        </div>
      </div>
    `;
  }
  return [];
}

// Wait for DOM to be loaded
document.addEventListener("DOMContentLoaded", function () {
  console.log("📄 DOM loaded, initializing app...");
  initializeApp();
});

function initializeApp() {
  console.log("🔧 Initializing app...");

  const form = document.querySelector("form");
  const promptInput = document.querySelector('input[name="prompt"]');
  const output = document.querySelector(".output");
  const imageInput = document.getElementById("imageInput");
  const archiveInput = document.getElementById("archiveInput");
  const downloadButton = document.getElementById("downloadButton");
  const imageFileInfo = document.getElementById("imageFileInfo");
  const archiveFileInfo = document.getElementById("archiveFileInfo");

  console.log("🔍 Checking DOM elements:");
  console.log("Form:", form ? "✅" : "❌");
  console.log("Prompt input:", promptInput ? "✅" : "❌");
  console.log("Output:", output ? "✅" : "❌");
  console.log("Image input:", imageInput ? "✅" : "❌");

  if (!form || !promptInput || !output || !imageInput) {
    console.error("❌ Essential DOM elements not found!");
    return;
  }

  console.log("✅ All essential DOM elements found!");

  // App state
  let currentResults = [];
  let isProcessing = false;
  let failedFiles = [];
  let apiLimitCount = 0;
  let consecutiveApiLimitErrors = 0;

  // Set default prompt
  if (promptInput && !promptInput.value.trim()) {
    promptInput.value =
      "Extract phone number from this image, give me only the number without any explanation";
    console.log("📝 Set default prompt value");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function updateProgress(processed, total, currentFileName = "") {
    const progress = Math.round((processed / total) * 100);
    const remaining = total - processed;
    if (output) {
      output.innerHTML = `
        <div style="background-color: #f0f8ff; padding: 16px; border-radius: 8px; margin: 10px 0;">
          <div style="color: #1976d2; font-weight: bold; margin-bottom: 8px;">
            🔄 Memproses gambar langsung ke AI... ${progress}% (${processed}/${total} files)
          </div>
          <div style="font-size: 14px; color: #333; margin-bottom: 4px;">
            ${currentFileName ? `Sedang memproses: ${currentFileName}` : "Menyiapkan proses..."}
          </div>
          <div style="font-size: 12px; color: #666;">
            Sisa: ${remaining} gambar | API Key ${currentApiKeyIndex + 1}/${API_KEYS.length} | Model: ${MODEL_NAME} | Hasil: ${currentResults.length} nomor ditemukan
          </div>
          <div style="width: 100%; background-color: #e0e0e0; border-radius: 4px; margin-top: 8px;">
            <div style="width: ${progress}%; height: 6px; background-color: #1976d2; border-radius: 4px; transition: width 0.3s ease;"></div>
          </div>
        </div>
      `;
    }
  }

  function updateFileInfo(fileInput, infoElement, fileType) {
    if (!fileInput || !infoElement) return;
    const files = Array.from(fileInput.files);
    if (files.length === 0) {
      infoElement.innerHTML = `<span class="empty">Belum ada file ${fileType} yang dipilih</span>`;
      return;
    }
    const maxDisplayFiles = 5;
    const displayFiles = files.slice(0, maxDisplayFiles);
    const remainingCount = files.length - maxDisplayFiles;
    const fileList = displayFiles
      .map((file) => {
        const size = (file.size / 1024 / 1024).toFixed(2);
        return `• ${file.name} (${size} MB)`;
      })
      .join("<br>");
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
    infoElement.innerHTML = `
      <strong>${files.length} file ${fileType} dipilih (${totalSizeMB} MB):</strong><br>
      ${fileList}
      ${remainingCount > 0 ? `<br><em style="color: #666; font-size: 13px;">...dan ${remainingCount} file lainnya</em>` : ''}
    `;
  }

  function setupDownloadButton() {
    if (!downloadButton) return;
    downloadButton.onclick = async () => {
      console.log("📥 Downloading results...");
      const formattedResults = currentResults
        .map((nomor) => {
          const cleanNumber = nomor.replace(/\D/g, "");
          if (cleanNumber.startsWith("08")) return "628" + cleanNumber.substring(2);
          if (cleanNumber.startsWith("62")) return cleanNumber;
          if (cleanNumber.startsWith("0")) return "62" + cleanNumber.substring(1);
          return "628" + cleanNumber;
        })
        .filter((nomor) => {
          return nomor.startsWith("628") && nomor.length >= 11 && nomor.length <= 14;
        });

      const textContent = formattedResults.join('\n');
      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nomor_telepon.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`📥 Downloaded ${formattedResults.length} phone numbers`);
    };
  }

  async function fetchWithTimeout(requestFunc, timeout = 30000) {
    return Promise.race([
      requestFunc(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), timeout)
      ),
    ]);
  }

  async function fetchWithRetryAndTimeout(
    requestFunc,
    currentFile,
    maxRetries = 5,
    delay = 2000,
    timeout = 20000
  ) {
    let lastError = null;
    let currentKey = getCurrentApiKey();
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const startTime = Date.now();
        apiKeyUsageCount[currentKey]++;
        console.log(`🔑 Menggunakan API Key ${currentApiKeyIndex + 1}/${API_KEYS.length} untuk ${currentFile.name}`);

        const result = await fetchWithTimeout(requestFunc, timeout);
        const endTime = Date.now();
        console.log(`⏱️ Response time untuk ${currentFile.name}: ${endTime - startTime} ms`);
        consecutiveApiLimitErrors = 0;
        return result;
      } catch (error) {
        lastError = error;
        retryCount++;
        console.warn(`⚠️ Percobaan ${retryCount} gagal untuk ${currentFile.name}:`, error.message);

        const isApiLimitError =
          error.message.includes("quota") ||
          error.message.includes("limit") ||
          error.message.includes("rate") ||
          error.message.includes("429");

        if (isApiLimitError) {
          apiLimitCount++;
          consecutiveApiLimitErrors++;
          apiKeyErrors[currentKey]++;
          console.log(`⚠️ API Key ${currentApiKeyIndex + 1} terkena limit!`);

          const nextKey = rotateApiKey();
          if (nextKey === null) {
            const waitTime = 30000;
            console.log(`⏰ Semua API Key limit! Menunggu ${waitTime / 1000} detik...`);
            if (output) {
              output.innerHTML = `
                <div style="background-color: #fff3e0; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #ff9800;">
                  <div style="color: #e65100; font-weight: bold; margin-bottom: 8px;">
                    ⏰ Semua API Key Mencapai Limit
                  </div>
                  <div style="font-size: 14px; color: #666;">
                    Menunggu ${waitTime / 1000} detik sebelum mencoba lagi...<br>
                    Model: ${MODEL_NAME}<br>
                    File: ${currentFile.name}
                  </div>
                </div>
              `;
            }
            await sleep(waitTime);
            resetAllApiKeyLimits();
            currentApiKeyIndex = 0;
            currentKey = getCurrentApiKey();
          } else {
            currentKey = nextKey;
            console.log(`🔄 Beralih ke API Key ${currentApiKeyIndex + 1}/${API_KEYS.length}`);
            await sleep(2000);
          }
        } else {
          const backoffDelay = delay * Math.pow(2, retryCount - 1);
          console.log(`🔄 Retry dalam ${backoffDelay} ms...`);
          await sleep(backoffDelay);
        }
      }
    }
    throw new Error(`Gagal setelah ${maxRetries} percobaan. Error terakhir: ${lastError.message}`);
  }

  // Helper: create Gemma model with current API key
  const createModel = () => {
    const genAI = new GoogleGenerativeAI(getCurrentApiKey());
    return genAI.getGenerativeModel({
      model: MODEL_NAME,
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    });
  };

  // Helper: normalisasi nomor telepon ke format 628
  const normalizePhoneFromText = (text) => {
    if (!text || typeof text !== "string") return null;
    const phoneMatch = text.match(/(?:^|\D)((?:62|0)8\d{8,11})(?:\D|$)/);
    if (!phoneMatch) return null;
    let phone = phoneMatch[1].replace(/\D/g, "");
    if (phone.startsWith("08")) phone = "628" + phone.slice(2);
    else if (phone.startsWith("0")) phone = "62" + phone.slice(1);
    else if (!phone.startsWith("62")) phone = "628" + phone;
    return phone;
  };

  // MAIN: Kirim gambar langsung ke Gemma (tanpa OCR)
  const processBatchOfImages = async (batchFiles, batchIndex, retryAttempt = 0) => {
    const n = batchFiles.length;
    const batchLabel = `Batch ${batchIndex + 1} (${n} gambar)${retryAttempt > 0 ? `, Retry ${retryAttempt}` : ""}`;
    console.log(`🖼️ Mengirim gambar langsung ke ${MODEL_NAME}: ${batchFiles.map((f) => f.name).join(", ")}`);

    // Konversi semua gambar ke base64
    const parts = [];
    for (const file of batchFiles) {
      const imageBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      // Tentukan mime type
      const mimeType = file.type || getMimeTypeByExtension(file.name);
      parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
    }

    // Buat prompt batch
    const batchPrompt =
      promptInput.value.trim() +
      `\n\n[Instruksi sistem] Saya mengirim ${n} gambar. Untuk setiap gambar (gambar 1, gambar 2, ...), ekstrak nomor telepon WhatsApp Indonesia. Berikan SATU nomor per baris, urutan sesuai gambar (baris 1 = gambar 1, baris 2 = gambar 2, ...). Hanya nomor per baris, tanpa penjelasan. Jika tidak ada nomor, tulis: TIDAK_DITEMUKAN.`;

    parts.push({ text: batchPrompt });

    const contents = { role: "user", parts };

    const result = await fetchWithRetryAndTimeout(
      () => {
        const model = createModel();
        return model.generateContentStream({ contents: [contents] });
      },
      { name: batchLabel },
      3,
      3000,
      60000
    );

    let aggregated = "";
    for await (const chunk of result.stream) {
      if (chunk.text) aggregated += chunk.text();
    }

    // Parse hasil dari model
    const lines = aggregated
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const results = [];

    for (let idx = 0; idx < n; idx++) {
      const raw = lines[idx] || "";
      const upper = raw.toUpperCase();
      let value = raw;
      if (upper === "TIDAK_DITEMUKAN" || upper === "TIDAK DITEMUKAN") {
        value = "TIDAK_DITEMUKAN";
      } else {
        const normalized = normalizePhoneFromText(raw);
        if (normalized) value = normalized;
      }
      results.push(value);
      console.log(`📞 [${batchLabel}] Gambar ${idx + 1} (${batchFiles[idx].name}): ${value}`);
    }

    return results;
  };

  // MAIN FORM SUBMISSION HANDLER
  console.log("📝 Adding form submission handler...");

  form.addEventListener("submit", async (ev) => {
    console.log("🚀 Form submit event triggered!");
    ev.preventDefault();
    ev.stopPropagation();

    if (isProcessing) {
      console.log("⏸️ Already processing, ignoring submit");
      return false;
    }

    console.log("▶️ Starting processing...");

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "⏳ Memproses...";
    }

    isProcessing = true;
    currentResults = [];
    failedFiles = [];
    apiLimitCount = 0;
    consecutiveApiLimitErrors = 0;
    if (downloadButton) downloadButton.style.display = "none";

    // Reset API key tracking
    API_KEYS.forEach((key, index) => {
      apiKeyUsageCount[key] = 0;
      apiKeyErrors[key] = 0;
      apiKeyLimitStatus[index] = false;
    });
    currentApiKeyIndex = 0;
    console.log("🔄 Status API key direset, mulai dari API Key 1");

    try {
      if (output) {
        output.innerHTML = `
          <div style="color: #1976d2; padding: 16px; background-color: #f0f8ff; border-radius: 8px; margin: 10px 0;">
            🚀 Memulai proses scanning gambar langsung ke ${MODEL_NAME}...
          </div>
        `;
      }

      const imageFiles = Array.from(imageInput?.files || []);
      const archiveFiles = Array.from(archiveInput?.files || []);
      const totalInputFiles = imageFiles.length + archiveFiles.length;

      console.log("📁 Input files:", totalInputFiles);
      console.log("🖼️ Direct images:", imageFiles.length);
      console.log("📦 Archive files:", archiveFiles.length);

      if (totalInputFiles === 0) {
        throw new Error("Tidak ada file yang dipilih. Silakan pilih gambar atau file ZIP terlebih dahulu.");
      }

      if (output) {
        output.innerHTML = `
          <div style="background-color: #e3f2fd; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #2196f3;">
            <div style="color: #1976d2; font-weight: bold; margin-bottom: 8px;">
              📁 Membaca file yang dipilih...
            </div>
            <div style="font-size: 14px; color: #666;">
              Total: ${totalInputFiles} file (${imageFiles.length} gambar + ${archiveFiles.length} arsip)
            </div>
          </div>
        `;
      }

      const allImages = [];
      let rarCount = 0;
      let zipCount = 0;
      let imageCount = 0;

      // Tambahkan gambar langsung
      for (const file of imageFiles) {
        if (isImageFile(file)) {
          allImages.push(file);
          imageCount++;
          console.log(`📷 Added direct image: ${file.name}`);
        }
      }

      // Ekstrak file arsip
      for (const file of archiveFiles) {
        if (isZipFile(file)) {
          zipCount++;
          console.log(`📦 Processing ZIP file: ${file.name}`);
          const extractedImages = await extractZipFile(file, output);
          allImages.push(...extractedImages);
        } else if (isRarFile(file)) {
          rarCount++;
          const extractedImages = await extractRarFile(file, output);
          allImages.push(...extractedImages);
        }
      }

      if (output) {
        output.innerHTML = `
          <div style="background-color: #e8f5e8; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #4caf50;">
            <div style="color: #2e7d32; font-weight: bold; margin-bottom: 12px;">📊 Ringkasan File:</div>
            <div style="font-size: 14px; color: #333; line-height: 1.6;">
              • ${zipCount} file ZIP diproses<br>
              • ${rarCount} file RAR diproses<br>
              • ${imageCount} gambar langsung<br>
              • <strong>Total ${allImages.length} gambar siap dikirim ke ${MODEL_NAME}</strong>
            </div>
          </div>
        `;
      }

      if (allImages.length === 0) {
        throw new Error("Tidak ada gambar yang ditemukan. Pastikan file yang dipilih berisi gambar dengan format JPG, PNG, WEBP, atau GIF.");
      }

      await sleep(1000);

      // Batch size: 5 gambar per request (optimal untuk model multimodal + hemat token)
      const BATCH_SIZE = 5;
      const totalFiles = allImages.length;
      const totalBatches = Math.ceil(totalFiles / BATCH_SIZE);
      let processedCount = 0;
      let lastBatchError = "";

      console.log(`📦 Batch mode: ${BATCH_SIZE} gambar per request → ${totalBatches} API call ke ${MODEL_NAME}`);

      for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
        const batchFiles = allImages.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE);

        updateProgress(processedCount, totalFiles, `Batch ${batchIndex + 1}/${totalBatches} (${batchFiles.length} gambar → ${MODEL_NAME})`);

        try {
          const batchResults = await processBatchOfImages(batchFiles, batchIndex);
          for (const r of batchResults) {
            if (r !== "TIDAK_DITEMUKAN") currentResults.push(r);
          }
          processedCount += batchFiles.length;
          updateProgress(processedCount, totalFiles, `Batch ${batchIndex + 1}/${totalBatches} selesai`);
        } catch (err) {
          lastBatchError = err?.message || String(err);
          console.error(`❌ Batch ${batchIndex + 1} gagal:`, err);
          for (const f of batchFiles) failedFiles.push(f);
          processedCount += batchFiles.length;
        }

        if (i + BATCH_SIZE < totalFiles) {
          console.log("⏸️ Waiting before next batch...");
          await sleep(3000);
        }
      }

      // Retry failed files
      const maxRetryRounds = 3;
      let retryRound = 1;

      while (failedFiles.length > 0 && retryRound <= maxRetryRounds) {
        console.log(`🔄 Starting retry round ${retryRound}/${maxRetryRounds} for ${failedFiles.length} failed files`);

        if (output) {
          output.innerHTML = `
            <div style="background-color: #fff3e0; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #ff9800;">
              <div style="color: #e65100; font-weight: bold; margin-bottom: 8px;">
                🔄 Mengulang file yang gagal (Putaran ${retryRound}/${maxRetryRounds})
              </div>
              <div style="font-size: 14px; color: #666;">
                File yang akan diulang: <strong>${failedFiles.length}</strong><br>
                Berhasil sejauh ini: <strong>${currentResults.length}</strong> nomor telepon
              </div>
            </div>
          `;
        }

        await sleep(5000);

        const filesToRetry = [...failedFiles];
        failedFiles = [];
        let retryProcessedCount = 0;

        for (let i = 0; i < filesToRetry.length; i += BATCH_SIZE) {
          const retryBatch = filesToRetry.slice(i, i + BATCH_SIZE);
          const retryBatchIndex = Math.floor(i / BATCH_SIZE);

          try {
            const batchResults = await processBatchOfImages(retryBatch, retryBatchIndex, retryRound);
            for (const r of batchResults) {
              if (r !== "TIDAK_DITEMUKAN") currentResults.push(r);
            }
            retryProcessedCount += retryBatch.length;
          } catch (err) {
            lastBatchError = err?.message || String(err);
            for (const f of retryBatch) failedFiles.push(f);
            retryProcessedCount += retryBatch.length;
          }

          if (i + BATCH_SIZE < filesToRetry.length) {
            await sleep(3000);
          }
        }

        if (failedFiles.length === 0) {
          console.log(`🎉 All files processed successfully after ${retryRound} retry rounds!`);
          break;
        }
        retryRound++;
      }

      // Complete
      isProcessing = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "🚀 Mulai Scan Nomor Telepon";
      }

      console.log("✅ Processing completed!");
      console.log("📊 Results:", currentResults);

      const successRate = Math.round(((totalFiles - failedFiles.length) / totalFiles) * 100);
      const resultColor = failedFiles.length === 0 ? '#e8f5e8' : '#fff3e0';
      const textColor = failedFiles.length === 0 ? '#2e7d32' : '#e65100';
      const icon = failedFiles.length === 0 ? '✅' : '⚠️';

      if (output) {
        output.innerHTML = `
          <div style="background-color: ${resultColor}; color: ${textColor}; padding: 16px; margin: 12px 0; border-radius: 8px; text-align: center; border-left: 4px solid ${textColor};">
            <div style="font-weight: bold; margin-bottom: 8px; font-size: 18px;">${icon} Proses Selesai!</div>
            <div style="font-size: 14px; line-height: 1.8;">
              Model AI: <strong>${MODEL_NAME}</strong><br>
              Total gambar diproses: <strong>${totalFiles}</strong><br>
              Nomor telepon ditemukan: <strong>${currentResults.length}</strong><br>
              Berhasil: <strong>${totalFiles - failedFiles.length}</strong> | Gagal: <strong>${failedFiles.length}</strong> (${successRate}% sukses)<br>
              ZIP diekstrak: <strong>${zipCount}</strong> | RAR diproses: <strong>${rarCount}</strong>
              ${retryRound > 1 ? `<br><br><em style="font-size: 13px;">🔄 Dilakukan ${retryRound - 1} putaran pengulangan otomatis</em>` : ''}
            </div>
          </div>
          ${failedFiles.length > 0 ? `
            <div style="background-color: #ffebee; color: #c62828; padding: 12px; margin: 8px 0; border-radius: 6px; font-size: 13px; border-left: 4px solid #f44336;">
              <strong>❌ File yang masih gagal setelah ${maxRetryRounds} kali pengulangan:</strong><br>
              ${lastBatchError ? `<div style="margin-top: 6px; font-size: 12px; color: #b71c1c; word-break: break-word;">Kemungkinan penyebab: ${lastBatchError}</div>` : ''}
              <div style="margin-top: 8px; text-align: left; max-height: 150px; overflow-y: auto;">
                ${failedFiles.map(f => `• ${f.name}`).join('<br>')}
              </div>
            </div>
          ` : ''}
        `;
      }

      if (currentResults.length > 0 && downloadButton) {
        downloadButton.style.display = "block";
        setupDownloadButton();
      }
    } catch (error) {
      console.error("💥 Main error:", error);
      isProcessing = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "🚀 Mulai Scan Nomor Telepon";
      }
      if (output) {
        output.innerHTML = `
          <div style="background-color: #ffcdd2; color: #d32f2f; padding: 16px; margin: 12px 0; border-radius: 8px; border-left: 4px solid #d32f2f;">
            <div style="font-weight: bold; margin-bottom: 8px;">🚫 Error:</div>
            <div style="font-size: 14px;">${error.message}</div>
          </div>
        `;
        if (currentResults.length > 0) {
          output.innerHTML += `
            <div style="background-color: #e8f5e8; color: #2e7d32; padding: 12px; margin: 8px 0; border-radius: 6px; font-size: 14px;">
              ✅ Anda dapat mengunduh ${currentResults.length} hasil yang berhasil diproses sebelum error.
            </div>
          `;
          if (downloadButton) {
            downloadButton.style.display = "block";
            setupDownloadButton();
          }
        }
      }
    }
  });

  // File input event listeners
  if (imageInput && imageFileInfo) {
    imageInput.addEventListener("change", () => {
      console.log("📁 Image files selected:", imageInput.files.length);
      updateFileInfo(imageInput, imageFileInfo, "gambar");
    });
  }

  if (archiveInput && archiveFileInfo) {
    archiveInput.addEventListener("change", () => {
      console.log("📦 Archive files selected:", archiveInput.files.length);
      updateFileInfo(archiveInput, archiveFileInfo, "arsip");
    });
  }

  // Initialize file info
  if (imageInput && imageFileInfo) updateFileInfo(imageInput, imageFileInfo, "gambar");
  if (archiveInput && archiveFileInfo) updateFileInfo(archiveInput, archiveFileInfo, "arsip");

  // Show API key banner
  if (API_KEYS.length > 0) {
    maybeShowApiKeyBanner(getCurrentApiKey());
  }

  console.log("✅ App initialization completed!");
  console.log(`🤖 Model: ${MODEL_NAME} (limit gratis besar, refresh cepat)`);
}

// Initialize when ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

// =====================================================
// 📥 DOWNLOAD DARI EXCEL - Module
// =====================================================

(function initDownloadModule() {
  // ---- Wait for DOM ----
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupDownloadModule);
  } else {
    setupDownloadModule();
  }

  function setupDownloadModule() {
    // --- Tab switching ---
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabPanels = document.querySelectorAll(".tab-panel");

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        tabButtons.forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        tabPanels.forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        const panel = document.getElementById("panel" + capitalize(target));
        if (panel) panel.classList.add("active");
      });
    });

    // --- Elements ---
    const uploadArea = document.getElementById("dlUploadArea");
    const excelInput = document.getElementById("dlExcelInput");
    const statsBar = document.getElementById("dlStatsBar");
    const controls = document.getElementById("dlControls");
    const actionBtns = document.getElementById("dlActionBtns");
    const tableWrapper = document.getElementById("dlTableWrapper");
    const tableBody = document.getElementById("dlTableBody");
    const progressWrap = document.getElementById("dlProgressWrap");
    const progressBarFill = document.getElementById("dlProgressBarFill");
    const progressText = document.getElementById("dlProgressText");
    const progressPct = document.getElementById("dlProgressPct");
    const progressTitle = document.getElementById("dlProgressTitle");
    const logEl = document.getElementById("dlLog");
    const filterDate = document.getElementById("dlFilterDate");
    const filterStatus = document.getElementById("dlFilterStatus");
    const btnDownloadAll = document.getElementById("dlBtnDownloadAll");
    const btnDownloadFiltered = document.getElementById("dlBtnDownloadFiltered");
    const btnSaveZip = document.getElementById("dlBtnSaveZip");
    const btnReset = document.getElementById("dlBtnReset");
    const statTotal = document.getElementById("dlStatTotal");
    const statDone = document.getElementById("dlStatDone");
    const statError = document.getElementById("dlStatError");
    const statPending = document.getElementById("dlStatPending");
    const previewModal = document.getElementById("previewModal");
    const previewModalImg = document.getElementById("previewModalImg");
    const previewModalClose = document.getElementById("previewModalClose");

    // --- State ---
    let rows = []; // { imageUri, postDate, postUrl, status, blob, filename }
    let downloadedBlobs = []; // { filename, blob }
    let isDownloading = false;

    // CORS proxies untuk bypass CORS saat ambil gambar
    const CORS_PROXIES = [
      (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      (url) => `https://cors-anywhere.herokuapp.com/${url}`,
    ];

    // --- Helpers ---
    function capitalize(s) {
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function addLog(msg, type = "info") {
      if (!logEl) return;
      logEl.classList.add("visible");
      const line = document.createElement("p");
      line.className = `dl-log-line ${type}`;
      const time = new Date().toLocaleTimeString("id-ID");
      line.textContent = `[${time}] ${msg}`;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    }

    function updateStats() {
      const total = rows.length;
      const done = rows.filter((r) => r.status === "done").length;
      const error = rows.filter((r) => r.status === "error").length;
      const pending = rows.filter((r) => r.status === "pending").length;
      if (statTotal) statTotal.textContent = total;
      if (statDone) statDone.textContent = done;
      if (statError) statError.textContent = error;
      if (statPending) statPending.textContent = pending;
    }

    function statusBadge(status) {
      const map = {
        pending: { cls: "status-pending", text: "⏳ Menunggu" },
        downloading: { cls: "status-downloading", text: "⬇️ Unduh..." },
        done: { cls: "status-done", text: "✅ Selesai" },
        error: { cls: "status-error", text: "❌ Gagal" },
        skip: { cls: "status-skip", text: "⏭️ Dilewati" },
      };
      const s = map[status] || map.pending;
      return `<span class="status-badge ${s.cls}">${s.text}</span>`;
    }

    function renderTable() {
      if (!tableBody) return;
      const dateFilter = filterDate ? filterDate.value.trim().toLowerCase() : "";
      const statusFilter = filterStatus ? filterStatus.value : "all";

      const filtered = rows.filter((r) => {
        const dateMatch = !dateFilter || (r.postDate || "").toLowerCase().includes(dateFilter);
        const statusMatch = statusFilter === "all" || r.status === statusFilter;
        return dateMatch && statusMatch;
      });

      tableBody.innerHTML = filtered
        .map((r, i) => {
          const globalIdx = rows.indexOf(r);
          const shortUri = r.imageUri.length > 50 ? r.imageUri.slice(0, 47) + "..." : r.imageUri;
          const shortPost = r.postUrl && r.postUrl.length > 40 ? r.postUrl.slice(0, 37) + "..." : (r.postUrl || "-");
          const thumbHtml = r.blob
            ? `<img src="${URL.createObjectURL(r.blob)}" alt="thumb" class="dl-thumb" title="${r.imageUri}" data-idx="${globalIdx}" />`
            : `<div class="dl-thumb-placeholder" title="${r.imageUri}">🖼️</div>`;

          return `<tr data-idx="${globalIdx}">
            <td style="text-align:center;color:#888">${globalIdx + 1}</td>
            <td>${thumbHtml}</td>
            <td title="${r.imageUri}"><a href="${r.imageUri}" target="_blank" rel="noopener" style="color:#1976d2;text-decoration:none">${shortUri}</a></td>
            <td style="color:#555">${r.postDate || "-"}</td>
            <td title="${r.postUrl || ''}">
              ${r.postUrl ? `<a href="${r.postUrl}" target="_blank" rel="noopener" style="color:#ff9800;text-decoration:none">${shortPost}</a>` : "-"}
            </td>
            <td>${statusBadge(r.status)}</td>
          </tr>`;
        })
        .join("");

      // Thumbnail preview click
      tableBody.querySelectorAll(".dl-thumb").forEach((img) => {
        img.addEventListener("click", () => {
          const idx = parseInt(img.dataset.idx);
          const row = rows[idx];
          if (row && row.blob && previewModal && previewModalImg) {
            previewModalImg.src = URL.createObjectURL(row.blob);
            previewModal.classList.add("open");
          }
        });
      });

      updateStats();
    }

    // --- Preview modal close ---
    if (previewModalClose) {
      previewModalClose.addEventListener("click", () => {
        if (previewModal) previewModal.classList.remove("open");
      });
    }
    if (previewModal) {
      previewModal.addEventListener("click", (e) => {
        if (e.target === previewModal) previewModal.classList.remove("open");
      });
    }

    // --- Load SheetJS (xlsx) ---
    async function loadSheetJS() {
      if (window.XLSX) return window.XLSX;
      addLog("Memuat library SheetJS...", "info");
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      addLog("SheetJS berhasil dimuat ✅", "ok");
      return window.XLSX;
    }

    // --- Parse Excel/CSV ---
    async function parseExcelFile(file) {
      const XLSX = await loadSheetJS();
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      if (json.length < 2) throw new Error("File Excel kosong atau tidak ada data");

      // Detect header row
      const header = json[0].map((h) => String(h).trim().toLowerCase());
      const colImageUri = findCol(header, ["image uri", "imageuri", "image_uri", "image url", "img uri", "img url", "url gambar"]);
      const colPostDate = findCol(header, ["post date", "postdate", "post_date", "date", "tanggal", "tgl"]);
      const colPostUrl = findCol(header, ["post url", "posturl", "post_url", "post link", "link", "url"]);

      addLog(`Kolom terdeteksi — Image URI: col ${colImageUri + 1}, Post Date: col ${colPostDate + 1}, Post URL: col ${colPostUrl + 1}`, "info");

      if (colImageUri === -1) throw new Error("Kolom 'Image URI' tidak ditemukan. Pastikan header kolom ada di baris pertama.");

      const parsed = [];
      for (let i = 1; i < json.length; i++) {
        const row = json[i];
        const uri = String(row[colImageUri] || "").trim();
        if (!uri || !uri.startsWith("http")) continue;
        const rawDate = row[colPostDate];
        let postDate = "";
        if (rawDate instanceof Date) {
          postDate = rawDate.toISOString().split("T")[0];
        } else if (rawDate) {
          postDate = String(rawDate).trim().split("T")[0];
        }
        const postUrl = colPostUrl >= 0 ? String(row[colPostUrl] || "").trim() : "";
        parsed.push({ imageUri: uri, postDate, postUrl, status: "pending", blob: null, filename: "" });
      }

      return parsed;
    }

    function findCol(header, candidates) {
      for (const c of candidates) {
        const idx = header.findIndex((h) => h.includes(c));
        if (idx >= 0) return idx;
      }
      return -1;
    }

    // --- Show UI after parse ---
    function showDownloadUI() {
      if (statsBar) statsBar.style.display = "flex";
      if (controls) controls.style.display = "flex";
      if (actionBtns) actionBtns.style.display = "flex";
      if (tableWrapper) tableWrapper.style.display = "block";
      renderTable();
    }

    // --- Upload area events ---
    if (uploadArea) {
      uploadArea.addEventListener("click", () => excelInput && excelInput.click());
      uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.classList.add("drag-over");
      });
      uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
      uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.classList.remove("drag-over");
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      });
    }

    if (excelInput) {
      excelInput.addEventListener("change", () => {
        if (excelInput.files[0]) handleFile(excelInput.files[0]);
      });
    }

    async function handleFile(file) {
      try {
        addLog(`📂 Membaca file: ${file.name}`, "info");
        rows = await parseExcelFile(file);
        downloadedBlobs = [];
        if (btnSaveZip) btnSaveZip.disabled = true;
        addLog(`✅ Ditemukan ${rows.length} link gambar`, "ok");
        showDownloadUI();
      } catch (err) {
        addLog(`❌ Gagal membaca file: ${err.message}`, "err");
        alert("Gagal membaca file: " + err.message);
      }
    }

    // --- Filter events ---
    if (filterDate) filterDate.addEventListener("input", renderTable);
    if (filterStatus) filterStatus.addEventListener("change", renderTable);

    // --- Download logic ---
    async function fetchImage(url) {
      // Try direct fetch first
      try {
        const resp = await fetch(url, { mode: "cors" });
        if (resp.ok) {
          const blob = await resp.blob();
          if (blob.size > 0) return blob;
        }
      } catch (_) {}

      // Try CORS proxies
      for (const proxyFn of CORS_PROXIES) {
        try {
          const proxyUrl = proxyFn(url);
          const resp = await fetch(proxyUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            if (blob.size > 0) return blob;
          }
        } catch (_) {}
      }

      throw new Error("Semua metode download gagal");
    }

    function getFilenameFromUri(uri, index) {
      try {
        const url = new URL(uri);
        const path = url.pathname;
        const name = path.split("/").pop().split("?")[0];
        if (name && name.includes(".")) return `img_${String(index + 1).padStart(4, "0")}_${name}`;
      } catch (_) {}
      return `img_${String(index + 1).padStart(4, "0")}.jpg`;
    }

    async function downloadRows(targetRows) {
      if (isDownloading) return;
      isDownloading = true;

      if (progressWrap) progressWrap.classList.add("visible");
      if (btnDownloadAll) btnDownloadAll.disabled = true;
      if (btnDownloadFiltered) btnDownloadFiltered.disabled = true;

      const total = targetRows.length;
      let done = 0;
      let errorCount = 0;

      addLog(`🚀 Mulai download ${total} gambar...`, "info");

      for (let i = 0; i < total; i++) {
        const row = targetRows[i];
        const globalIdx = rows.indexOf(row);

        // Update progress
        const pct = Math.round((i / total) * 100);
        if (progressBarFill) progressBarFill.style.width = pct + "%";
        if (progressText) progressText.textContent = `${i} / ${total}`;
        if (progressPct) progressPct.textContent = pct + "%";
        if (progressTitle) progressTitle.textContent = `⬇️ Mengunduh... (${i + 1}/${total})`;

        rows[globalIdx].status = "downloading";
        renderTable();

        try {
          const blob = await fetchImage(row.imageUri);
          const filename = getFilenameFromUri(row.imageUri, globalIdx);
          rows[globalIdx].blob = blob;
          rows[globalIdx].filename = filename;
          rows[globalIdx].status = "done";
          downloadedBlobs.push({ filename, blob });
          done++;
          addLog(`✅ [${i + 1}/${total}] ${filename}`, "ok");
        } catch (err) {
          rows[globalIdx].status = "error";
          errorCount++;
          addLog(`❌ [${i + 1}/${total}] Gagal: ${row.imageUri.slice(0, 60)}... → ${err.message}`, "err");
        }

        renderTable();
        // Small throttle to avoid rate limiting
        await new Promise((r) => setTimeout(r, 300));
      }

      // Final progress
      if (progressBarFill) progressBarFill.style.width = "100%";
      if (progressText) progressText.textContent = `${total} / ${total}`;
      if (progressPct) progressPct.textContent = "100%";
      if (progressTitle) progressTitle.textContent = `✅ Download selesai! ${done} berhasil, ${errorCount} gagal`;

      addLog(`🎉 Selesai! ${done} berhasil, ${errorCount} gagal dari ${total} gambar`, done === total ? "ok" : "err");

      if (downloadedBlobs.length > 0 && btnSaveZip) btnSaveZip.disabled = false;
      if (btnDownloadAll) btnDownloadAll.disabled = false;
      if (btnDownloadFiltered) btnDownloadFiltered.disabled = false;

      isDownloading = false;
      renderTable();
    }

    // --- Buttons ---
    if (btnDownloadAll) {
      btnDownloadAll.addEventListener("click", () => {
        const targets = rows.filter((r) => r.status !== "done");
        if (targets.length === 0) {
          alert("Semua gambar sudah diunduh!");
          return;
        }
        downloadRows(targets);
      });
    }

    if (btnDownloadFiltered) {
      btnDownloadFiltered.addEventListener("click", () => {
        const dateFilter = filterDate ? filterDate.value.trim().toLowerCase() : "";
        const statusFilter = filterStatus ? filterStatus.value : "all";
        const targets = rows.filter((r) => {
          const dateMatch = !dateFilter || (r.postDate || "").toLowerCase().includes(dateFilter);
          const statusMatch = statusFilter === "all" || r.status === statusFilter;
          return dateMatch && statusMatch && r.status !== "done";
        });
        if (targets.length === 0) {
          alert("Tidak ada gambar yang cocok dengan filter / sudah semua diunduh.");
          return;
        }
        downloadRows(targets);
      });
    }

    // --- Save as ZIP ---
    if (btnSaveZip) {
      btnSaveZip.addEventListener("click", async () => {
        if (downloadedBlobs.length === 0) {
          alert("Belum ada gambar yang berhasil diunduh.");
          return;
        }

        btnSaveZip.disabled = true;
        btnSaveZip.textContent = "⏳ Membuat ZIP...";

        try {
          // Load JSZip
          if (!window.JSZip) {
            addLog("Memuat JSZip...", "info");
            await new Promise((resolve, reject) => {
              const s = document.createElement("script");
              s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
              s.onload = resolve;
              s.onerror = reject;
              document.head.appendChild(s);
            });
          }

          const zip = new window.JSZip();
          const folder = zip.folder("images");
          const usedNames = {};

          for (const { filename, blob } of downloadedBlobs) {
            let name = filename;
            if (usedNames[name]) {
              const ext = name.includes(".") ? "." + name.split(".").pop() : "";
              const base = name.replace(ext, "");
              name = `${base}_${usedNames[filename]}${ext}`;
            }
            usedNames[filename] = (usedNames[filename] || 0) + 1;
            folder.file(name, blob);
          }

          addLog(`📦 Membuat ZIP dari ${downloadedBlobs.length} gambar...`, "info");
          const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } });

          const ts = new Date().toISOString().slice(0, 10);
          const a = document.createElement("a");
          a.href = URL.createObjectURL(zipBlob);
          a.download = `images_${ts}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(a.href);

          addLog(`✅ ZIP berhasil disimpan: images_${ts}.zip`, "ok");
        } catch (err) {
          addLog(`❌ Gagal membuat ZIP: ${err.message}`, "err");
          alert("Gagal membuat ZIP: " + err.message);
        }

        btnSaveZip.disabled = false;
        btnSaveZip.textContent = "📦 Simpan sebagai ZIP";
      });
    }

    // --- Reset ---
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        if (!confirm("Reset semua data dan mulai dari awal?")) return;
        rows = [];
        downloadedBlobs = [];
        if (tableWrapper) tableWrapper.style.display = "none";
        if (statsBar) statsBar.style.display = "none";
        if (controls) controls.style.display = "none";
        if (actionBtns) actionBtns.style.display = "none";
        if (progressWrap) progressWrap.classList.remove("visible");
        if (logEl) { logEl.innerHTML = ""; logEl.classList.remove("visible"); }
        if (excelInput) excelInput.value = "";
        if (btnSaveZip) btnSaveZip.disabled = true;
        addLog("🔄 Data direset", "info");
      });
    }

    addLog("✅ Modul Download dari Excel siap digunakan", "ok");
  }
})();

