import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { maybeShowApiKeyBanner } from "./gemini-api-banner";
import * as XLSX from "xlsx";
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
].filter((key) => key); // Filter out any undefined or empty keys

console.log("🚀 Starting Phone Scanner App...");
console.log("API Keys found:", API_KEYS.length);

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

// Initialize API key tracking
API_KEYS.forEach((key) => {
  apiKeyUsageCount[key] = 0;
  apiKeyErrors[key] = 0;
});

function getNextApiKey() {
  // Find the key with the least errors
  const minErrors = Math.min(...Object.values(apiKeyErrors));
  const availableKeys = API_KEYS.filter(
    (key) => apiKeyErrors[key] === minErrors
  );

  // Among the keys with least errors, find the one with least usage
  const minUsage = Math.min(
    ...availableKeys.map((key) => apiKeyUsageCount[key])
  );
  const bestKeys = availableKeys.filter(
    (key) => apiKeyUsageCount[key] === minUsage
  );

  // Select a random key from the best candidates
  const selectedKey = bestKeys[Math.floor(Math.random() * bestKeys.length)];
  currentApiKeyIndex = API_KEYS.indexOf(selectedKey);
  return selectedKey;
}

function rotateApiKey() {
  currentApiKeyIndex = (currentApiKeyIndex + 1) % API_KEYS.length;
  return API_KEYS[currentApiKeyIndex];
}

// Helper functions - define these globally so they're available everywhere
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

// Improved ZIP extraction using JSZip
async function extractZipFile(zipFile, output) {
  try {
    console.log(`📦 Starting ZIP extraction: ${zipFile.name}`);

    // Show extraction status
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

    // Load JSZip from CDN if not available
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

    // Show reading status
    if (output) {
      output.innerHTML = `
        <div style="background-color: #fff3e0; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #ff9800;">
          <div style="color: #e65100; font-weight: bold; margin-bottom: 8px;">
            📦 Membaca ZIP: ${zipFile.name}
          </div>
          <div style="font-size: 14px; color: #666;">
            Menganalisis isi file...
          </div>
          <div style="margin-top: 8px;">
            <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #ff9800; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          </div>
        </div>
      `;
    }

    const buffer = await zipFile.arrayBuffer();
    const loadedZip = await zip.loadAsync(buffer);

    const extractedImages = [];
    const imageFiles = [];

    // Find all image files first
    loadedZip.forEach((relativePath, file) => {
      const name = relativePath.toLowerCase();

      // Check if it's an image file and not a directory
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
            <div style="font-size: 14px; color: #666;">
              ZIP tidak mengandung gambar dengan format yang didukung
            </div>
          </div>
        `;
      }
      return [];
    }

    // Extract image files one by one with progress
    for (let i = 0; i < imageFiles.length; i++) {
      const { path, file } = imageFiles[i];

      try {
        // Show extraction progress
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
              <div style="font-size: 12px; color: #555;">
                Sedang ekstrak: ${path}
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

    console.log(
      `🎉 ZIP extraction completed: ${extractedImages.length} images extracted`
    );

    // Show completion
    if (output) {
      output.innerHTML = `
        <div style="background-color: #e8f5e8; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #4caf50;">
          <div style="color: #2e7d32; font-weight: bold; margin-bottom: 8px;">
            ✅ ZIP ekstraksi selesai: ${zipFile.name}
          </div>
          <div style="font-size: 14px; color: #666;">
            Berhasil mengekstrak ${extractedImages.length} gambar dari ${imageFiles.length} file gambar
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

// Simplified RAR extraction - focus on ZIP for now since it's more reliable
async function extractRarFile(rarFile, output) {
  try {
    console.log(`📦 Starting RAR extraction: ${rarFile.name}`);

    // Show status
    if (output) {
      output.innerHTML = `
        <div style="background-color: #fff3e0; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #ff9800;">
          <div style="color: #e65100; font-weight: bold; margin-bottom: 8px;">
            📦 Mencoba mengekstrak RAR: ${rarFile.name}
          </div>
          <div style="font-size: 14px; color: #666;">
            Memuat library ekstraksi...
          </div>
        </div>
      `;
    }

    // For now, show message that RAR extraction is experimental
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

    return []; // Return empty for now
  } catch (error) {
    console.error("💥 RAR extraction failed:", error);
    return [];
  }
}

// Wait for DOM to be loaded
document.addEventListener("DOMContentLoaded", function () {
  console.log("📄 DOM loaded, initializing app...");
  initializeApp();
});

function initializeApp() {
  console.log("🔧 Initializing app...");

  // Get DOM elements
  const form = document.querySelector("form");
  const promptInput = document.querySelector('input[name="prompt"]');
  const output = document.querySelector(".output");
  const imageInput = document.getElementById("imageInput");
  const archiveInput = document.getElementById("archiveInput");
  const downloadButton = document.getElementById("downloadButton");
  const imageFileInfo = document.getElementById("imageFileInfo");
  const archiveFileInfo = document.getElementById("archiveFileInfo");

  // Check if elements exist with detailed logging
  console.log("🔍 Checking DOM elements:");
  console.log("Form:", form ? "✅" : "❌");
  console.log("Prompt input:", promptInput ? "✅" : "❌");
  console.log("Output:", output ? "✅" : "❌");
  console.log("Image input:", imageInput ? "✅" : "❌");
  console.log("Archive input:", archiveInput ? "✅" : "❌");
  console.log("Download button:", downloadButton ? "✅" : "❌");
  console.log("Image file info:", imageFileInfo ? "✅" : "❌");
  console.log("Archive file info:", archiveFileInfo ? "✅" : "❌");

  if (!form) {
    console.error(
      "❌ Form not found! Make sure your HTML has a <form> element"
    );
    return;
  }
  if (!promptInput) {
    console.error(
      '❌ Prompt input not found! Make sure you have input[name="prompt"]'
    );
    return;
  }
  if (!output) {
    console.error(
      '❌ Output element not found! Make sure you have element with class "output"'
    );
    return;
  }
  if (!imageInput) {
    console.error(
      '❌ Image input not found! Make sure you have input with id "imageInput"'
    );
    return;
  }

  console.log("✅ All essential DOM elements found!");

  // App state variables
  let currentResults = [];
  let isProcessing = false;
  let cache = {};
  let failedFiles = [];
  let apiLimitCount = 0;
  let consecutiveApiLimitErrors = 0;

  // Set default prompt if empty
  if (promptInput && !promptInput.value.trim()) {
    promptInput.value =
      "Extract phone number from this image, give me only the number without any explanation";
    console.log("📝 Set default prompt value");
  }

  // Helper functions
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
            🔄 Memproses gambar dengan AI... ${progress}% (${processed}/${total} files)
          </div>
          <div style="font-size: 14px; color: #333; margin-bottom: 4px;">
            ${
              currentFileName
                ? `Sedang memproses: ${currentFileName}`
                : "Menyiapkan proses..."
            }
          </div>
          <div style="font-size: 12px; color: #666;">
            Sisa: ${remaining} gambar | API Key ${
        currentApiKeyIndex + 1
      } | Hasil: ${currentResults.length} nomor ditemukan
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

    const fileList = files
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
    `;
  }

  function setupDownloadButton() {
    if (!downloadButton) return;

    downloadButton.onclick = async () => {
      console.log("📥 Downloading results...");
      const formattedResults = currentResults.map((nomor) => {
        return nomor.replace(/-/g, "").replace(/\s/g, "").replace(/^08/, "628");
      });
      const worksheet = XLSX.utils.json_to_sheet(
        formattedResults.map((nomor) => ({ NomorTelepon: nomor }))
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Nomor Telepon");
      XLSX.writeFile(workbook, "nomor_telepon.xlsx");
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
    maxRetries = 3,
    delay = 2000,
    timeout = 20000
  ) {
    let lastError = null;
    let currentKey = getNextApiKey();
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const startTime = Date.now();
        apiKeyUsageCount[currentKey]++;

        console.log(
          `🔑 Using API Key ${currentApiKeyIndex + 1} for ${currentFile.name}`
        );

        const result = await fetchWithTimeout(requestFunc, timeout);
        const endTime = Date.now();
        console.log(
          `⏱️ Response time for ${currentFile.name}: ${endTime - startTime} ms`
        );
        consecutiveApiLimitErrors = 0;
        return result;
      } catch (error) {
        lastError = error;
        retryCount++;
        console.warn(
          `⚠️ Attempt ${retryCount} failed for ${currentFile.name}:`,
          error.message
        );

        const isApiLimitError =
          error.message.includes("quota") ||
          error.message.includes("limit") ||
          error.message.includes("rate");

        if (isApiLimitError) {
          apiLimitCount++;
          consecutiveApiLimitErrors++;
          apiKeyErrors[currentKey]++;

          const baseDelay = 30000;
          const delayMultiplier = Math.pow(2, consecutiveApiLimitErrors - 1);
          const backoffDelay = baseDelay * delayMultiplier;

          console.log(
            `🕒 API limit hit, waiting ${Math.round(backoffDelay / 1000)}s...`
          );
          if (output) {
            output.innerHTML = `<p>Processing... Please wait (${Math.round(
              backoffDelay / 1000
            )}s)</p>`;
          }
          await sleep(backoffDelay);

          currentKey = rotateApiKey();
          console.log(`🔄 Switched to API Key ${currentApiKeyIndex + 1}`);
        } else {
          const backoffDelay = delay * Math.pow(2, retryCount - 1);
          console.log(`🔄 Retrying in ${backoffDelay} ms...`);
          await sleep(backoffDelay);
        }
      }
    }
    throw new Error(
      `Failed after ${maxRetries} attempts. Last error: ${lastError.message}`
    );
  }

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

    // Get submit button and disable it
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "⏳ Memproses...";
      console.log("🔒 Submit button disabled");
    }

    // Reset states
    isProcessing = true;
    currentResults = [];
    failedFiles = [];
    apiLimitCount = 0;
    consecutiveApiLimitErrors = 0;
    if (downloadButton) downloadButton.style.display = "none";

    // Reset API key tracking
    API_KEYS.forEach((key) => {
      apiKeyUsageCount[key] = 0;
      apiKeyErrors[key] = 0;
    });

    try {
      // Show initial status
      if (output) {
        output.innerHTML =
          '<div style="color: #1976d2; padding: 16px; background-color: #f0f8ff; border-radius: 8px; margin: 10px 0;">🚀 Memulai proses scanning...</div>';
      }

      // Get files
      const imageFiles = Array.from(imageInput?.files || []);
      const archiveFiles = Array.from(archiveInput?.files || []);
      const totalInputFiles = imageFiles.length + archiveFiles.length;

      console.log("📁 Input files:", totalInputFiles);
      console.log("🖼️ Direct images:", imageFiles.length);
      console.log("📦 Archive files:", archiveFiles.length);

      if (totalInputFiles === 0) {
        throw new Error(
          "Tidak ada file yang dipilih. Silakan pilih gambar atau file ZIP terlebih dahulu."
        );
      }

      // Show file reading status
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

      // Process all files
      const allImages = [];
      let rarCount = 0;
      let zipCount = 0;
      let imageCount = 0;

      // Add direct image files
      for (const file of imageFiles) {
        if (isImageFile(file)) {
          allImages.push(file);
          imageCount++;
          console.log(`📷 Added direct image: ${file.name}`);
        }
      }

      // Extract archive files
      for (const file of archiveFiles) {
        if (isZipFile(file)) {
          zipCount++;
          console.log(`📦 Processing ZIP file: ${file.name}`);

          const extractedImages = await extractZipFile(file, output);
          allImages.push(...extractedImages);
          console.log(
            `📦 ZIP ${file.name}: extracted ${extractedImages.length} images`
          );
        } else if (isRarFile(file)) {
          rarCount++;
          console.log(`📦 Processing RAR file: ${file.name}`);

          const extractedImages = await extractRarFile(file, output);
          allImages.push(...extractedImages);
          console.log(
            `📦 RAR ${file.name}: extracted ${extractedImages.length} images`
          );
        }
      }

      // Show summary
      if (output) {
        output.innerHTML = `
          <div style="background-color: #e8f5e8; padding: 16px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #4caf50;">
            <div style="color: #2e7d32; font-weight: bold; margin-bottom: 12px;">📊 Ringkasan File:</div>
            <div style="font-size: 14px; color: #333; line-height: 1.6;">
              • ${zipCount} file ZIP diproses<br>
              • ${rarCount} file RAR diproses<br>
              • ${imageCount} gambar langsung diproses<br>
              • <strong>Total ${allImages.length} gambar siap diproses</strong>
            </div>
          </div>
        `;
      }

      if (allImages.length === 0) {
        throw new Error(
          "Tidak ada gambar yang ditemukan. Pastikan file yang dipilih berisi gambar dengan format JPG, PNG, WEBP, atau GIF."
        );
      }

      await sleep(1500); // Show summary briefly

      // Initialize AI model
      console.log("🤖 Initializing Gemini AI...");
      const genAI = new GoogleGenerativeAI(getNextApiKey());
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
        ],
      });

      const batchSize = 2; // Conservative batch size
      const totalFiles = allImages.length;
      let processedCount = 0;

      // Process images in batches
      for (let i = 0; i < totalFiles; i += batchSize) {
        const batchFiles = allImages.slice(i, i + batchSize);
        console.log(
          `📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
            totalFiles / batchSize
          )}`
        );

        const batchPromises = batchFiles.map(async (currentFile) => {
          try {
            console.log(`🔍 Processing file: ${currentFile.name}`);
            updateProgress(processedCount, totalFiles, currentFile.name);

            // Convert to base64
            const imageBase64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (event) =>
                resolve(event.target.result.split(",")[1]);
              reader.onerror = (error) => reject(error);
              reader.readAsDataURL(currentFile);
            });

            const contents = {
              role: "user",
              parts: [
                {
                  inline_data: {
                    mime_type: currentFile.type,
                    data: imageBase64,
                  },
                },
                { text: promptInput.value },
              ],
            };

            // Check cache
            const cacheKey = JSON.stringify(contents);
            if (cache[cacheKey]) {
              console.log(`💾 Using cached result for ${currentFile.name}`);
              currentResults.push(cache[cacheKey]);
              processedCount++;
              updateProgress(processedCount, totalFiles, currentFile.name);
              return;
            }

            // Make AI request
            const result = await fetchWithRetryAndTimeout(
              () => model.generateContentStream({ contents: [contents] }),
              currentFile,
              3,
              3000,
              25000
            );

            let aggregatedResult = "";
            for await (let response of result.stream) {
              if (response.text) {
                aggregatedResult += response.text();
              }
            }

            // Extract phone number
            const phoneMatch = aggregatedResult.match(
              /(?:^|\D)((?:62|0)8\d{8,11})(?:\D|$)/
            );
            if (phoneMatch) {
              aggregatedResult = phoneMatch[1].replace(/^08/, "628");
            }

            console.log(
              `📞 Found result for ${currentFile.name}:`,
              aggregatedResult
            );

            cache[cacheKey] = aggregatedResult;
            currentResults.push(aggregatedResult);
            processedCount++;
            updateProgress(processedCount, totalFiles, currentFile.name);
          } catch (error) {
            console.error(`❌ Error processing ${currentFile.name}:`, error);
            failedFiles.push(currentFile);
            processedCount++;
            updateProgress(processedCount, totalFiles, currentFile.name);
          }
        });

        await Promise.all(batchPromises);

        // Delay between batches
        if (i + batchSize < totalFiles) {
          console.log("⏸️ Waiting before next batch...");
          await sleep(5000);
        }
      }

      // Complete
      isProcessing = false;

      // Re-enable submit button
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "🚀 Mulai Scan Nomor Telepon";
        console.log("🔓 Submit button re-enabled");
      }

      // Show results
      console.log("✅ Processing completed!");
      console.log("📊 Results:", currentResults);

      if (output) {
        output.innerHTML = `
          <div style="background-color: #e8f5e8; color: #2e7d32; padding: 16px; margin: 12px 0; border-radius: 8px; text-align: center;">
            <div style="font-weight: bold; margin-bottom: 8px; font-size: 18px;">✅ Proses Selesai!</div>
            <div style="font-size: 14px; line-height: 1.6;">
              Total gambar diproses: <strong>${totalFiles}</strong><br>
              Nomor telepon ditemukan: <strong>${currentResults.length}</strong><br>
              File gagal diproses: <strong>${failedFiles.length}</strong><br>
              ZIP diekstrak: <strong>${zipCount}</strong> | RAR diproses: <strong>${rarCount}</strong>
            </div>
          </div>
        `;
      }

      // Show download button if we have results
      if (currentResults.length > 0 && downloadButton) {
        downloadButton.style.display = "block";
        setupDownloadButton();
        console.log("📥 Download button enabled");
      }
    } catch (error) {
      console.error("💥 Main error:", error);
      isProcessing = false;

      // Re-enable submit button
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "🚀 Mulai Scan Nomor Telepon";
      }

      // Show error
      if (output) {
        output.innerHTML = `
          <div style="background-color: #ffcdd2; color: #d32f2f; padding: 16px; margin: 12px 0; border-radius: 8px; border-left: 4px solid #d32f2f;">
            <div style="font-weight: bold; margin-bottom: 8px;">🚫 Error:</div>
            <div style="font-size: 14px;">${error.message}</div>
          </div>
        `;

        // Show download button if we have partial results
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

  // Add event listeners for file inputs
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

      // Show notification for archive files
      if (archiveInput.files.length > 0) {
        const archiveTypes = Array.from(archiveInput.files).map((f) => {
          const name = f.name.toLowerCase();
          if (name.endsWith(".rar")) return "RAR";
          if (name.endsWith(".zip")) return "ZIP";
          return "Unknown";
        });

        const notification = document.createElement("div");
        notification.style.cssText =
          "background-color: #e3f2fd; color: #1565c0; padding: 12px; margin: 8px 0; border-radius: 6px; font-size: 14px; border-left: 4px solid #2196f3;";
        notification.innerHTML = `
          📦 File arsip dipilih: ${Array.from(archiveInput.files)
            .map((f) => f.name)
            .join(", ")}<br>
          <small>✅ ZIP akan diekstrak otomatis | ⚠️ RAR dalam pengembangan</small>
        `;

        // Remove any existing notifications
        const existingNotifications = document.querySelectorAll(
          ".archive-notification"
        );
        existingNotifications.forEach((n) => n.remove());

        notification.className = "archive-notification";
        archiveFileInfo.parentNode.insertBefore(
          notification,
          archiveFileInfo.nextSibling
        );
      }
    });
  }

  // Initialize file info display
  if (imageInput && imageFileInfo) {
    updateFileInfo(imageInput, imageFileInfo, "gambar");
  }
  if (archiveInput && archiveFileInfo) {
    updateFileInfo(archiveInput, archiveFileInfo, "arsip");
  }

  // Test function
  window.testScan = function () {
    console.log("🧪 Testing scan functionality...");
    if (output) {
      output.innerHTML = `
        <div style="background-color: #e3f2fd; padding: 16px; border-radius: 8px; margin: 10px 0;">
          <div style="color: #1976d2; font-weight: bold;">🧪 Test Mode Aktif</div>
          <div style="font-size: 14px; color: #666; margin-top: 8px;">
            ✅ Sistem siap digunakan!<br>
            📁 Upload gambar atau ZIP dan klik tombol scan untuk memulai.<br>
            🤖 AI Gemini siap memproses gambar Anda.<br>
            📦 ZIP extraction sudah stabil dan siap digunakan.<br>
            ⚠️ RAR extraction masih dalam pengembangan.
          </div>
        </div>
      `;
    }
  };

  // Test ZIP extraction
  window.testZip = function () {
    console.log("🧪 Testing ZIP extraction capabilities...");
    console.log("Available extraction methods:");
    console.log("✅ JSZip for ZIP files (stable)");
    console.log("⚠️ RAR extraction (in development)");

    if (output) {
      output.innerHTML = `
        <div style="background-color: #f3e5f5; padding: 16px; border-radius: 8px; margin: 10px 0;">
          <div style="color: #7b1fa2; font-weight: bold;">📦 Archive Support Status</div>
          <div style="font-size: 14px; color: #666; margin-top: 8px;">
            ✅ <strong>ZIP files:</strong> Fully supported with JSZip<br>
            ⚠️ <strong>RAR files:</strong> In development - use ZIP for best results<br>
            📁 <strong>Direct images:</strong> Fully supported (JPG, PNG, WEBP, GIF, BMP)
          </div>
        </div>
      `;
    }
  };

  // Show API key banner if available
  if (API_KEYS.length > 0) {
    maybeShowApiKeyBanner(API_KEYS[currentApiKeyIndex]);
  }

  console.log("✅ App initialization completed successfully!");
  console.log("🧪 You can test with: window.testScan()");
  console.log("📦 Test archive support with: window.testZip()");
}

// Initialize when ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}
