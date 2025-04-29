import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import MarkdownIt from 'markdown-it';
import { maybeShowApiKeyBanner } from './gemini-api-banner';
import * as XLSX from 'xlsx';
import './style.css';

// 🔥 FILL THIS OUT FIRST! 🔥
// 🔥 GET YOUR GEMINI API KEY AT 🔥
// 🔥 https://g.co/ai/idxGetGeminiKey 🔥
let API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

let form = document.querySelector('form');
let promptInput = document.querySelector('input[name="prompt"]');
let output = document.querySelector('.output');
let imageInput = document.getElementById('imageInput');
let downloadButton = document.getElementById('downloadButton');
let refreshButton = document.getElementById('refresh');
let currentPage = 1;
let resultsPerPage = 15;
let currentResults = [];
let processingIndex = 0;
let isProcessing = false;
let cache = {};
let failedFiles = [];

// Fungsi untuk menambahkan jeda
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fungsi untuk retry dengan penanganan error
async function fetchWithRetry(requestFunc, maxRetries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFunc();
    } catch (error) {
      if (attempt < maxRetries) {
        console.warn(`Attempt ${attempt} failed. Retrying in ${delay} ms...`);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
}

async function fetchWithTimeout(requestFunc, timeout = 30000) {
  return Promise.race([
    requestFunc(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))
  ]);
}

async function fetchWithRetryAndTimeout(requestFunc, currentFile, maxRetries = 3, delay = 2000, timeout = 20000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now(); // Waktu mulai
      const result = await fetchWithTimeout(requestFunc, timeout);
      const endTime = Date.now(); // Waktu selesai
      console.log(`Response time for ${currentFile.name}: ${endTime - startTime} ms`); // Log waktu respons
      return result;
    } catch (error) {
      if (attempt < maxRetries) {
        console.warn(`Attempt ${attempt} failed for ${currentFile.name}. Retrying in ${delay} ms...`);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
}

// Add this function to extract just phone numbers
function extractPhoneNumber(text) {
  // This regex looks for Indonesian phone number patterns
  const phoneRegex = /(?:^|\D)((?:62|0)8\d{8,11})(?:\D|$)/g;
  const matches = [];
  let match;

  while ((match = phoneRegex.exec(text)) !== null) {
    matches.push(match[1]);
  }

  return matches.length > 0 ? matches[0] : text;
}

function displayResultsForPage(page) {
  output.innerHTML = '';
  let startIndex = (page - 1) * resultsPerPage;
  let endIndex = startIndex + resultsPerPage;
  for (let i = startIndex; i < endIndex && i < currentResults.length; i++) {
    let text = currentResults[i];

    // First, try to extract just the phone number
    let phoneNumber = extractPhoneNumber(text);

    // If extraction didn't work well, do your existing cleanup
    if (phoneNumber === text) {
      text = text.replace(/-\n/g, '');
      text = text.replace(/\n/g, ' ');
      text = text.replace(/\s{2,}/g, ' ');
      text = text.replace(/(\d{3,4})(\s|-)?(\d{3,4})(\s|-)?(\d{3,4})/g, (match, p1, p2, p3, p4, p5) => {
        return `${p1}${p3}${p5}`;
      });
      text = text.replace(/\s/g, '');
      text = text.replace(/^08/, '628');
    } else {
      // Format the extracted phone number
      phoneNumber = phoneNumber.replace(/^08/, '628').replace(/\D/g, '');
      text = phoneNumber;
    }

    output.innerHTML += new MarkdownIt().render(text);
  }
  addPaginationButtons();
}

// Fungsi untuk menambahkan tombol paginasi
function addPaginationButtons() {
  let existingButtons = output.querySelectorAll('button');
  existingButtons.forEach(button => button.remove());
  if (currentResults.length > 0) {
    if (currentPage > 1) {
      let prevButton = document.createElement('button');
      prevButton.textContent = 'Sebelumnya';
      prevButton.onclick = () => {
        currentPage--;
        displayResultsForPage(currentPage);
      };
      output.appendChild(prevButton);
    }
    if (currentResults.length > currentPage * resultsPerPage) {
      let nextButton = document.createElement('button');
      nextButton.textContent = 'Berikutnya';
      nextButton.onclick = () => {
        currentPage++;
        displayResultsForPage(currentPage);
      };
      nextButton.style.marginLeft = '10px';
      output.appendChild(nextButton);
    }
  }
}

// Fungsi utama untuk menangani pengiriman form
form.onsubmit = async (ev) => {
  ev.preventDefault();

  if (isProcessing) {
    return;
  }

  output.textContent = 'Generating...';
  downloadButton.style.display = 'none';
  isProcessing = true;

  try {
    const files = imageInput.files;
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    });

    let md = new MarkdownIt();

    const batchSize = 5;

    for (; processingIndex < files.length; processingIndex += batchSize) {
      const batchFiles = Array.from(files).slice(processingIndex, processingIndex + batchSize);

      for (const currentFile of batchFiles) {
        try {
          console.log(`Processing file: ${currentFile.name}`);
          const imageBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result.split(',')[1]);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(currentFile);
          });

          const contents = {
            role: 'user',
            parts: [
              { inline_data: { mime_type: currentFile.type, data: imageBase64 } },
              { text: promptInput.value }
            ]
          };

          const cacheKey = JSON.stringify(contents);

          if (cache[cacheKey]) {
            currentResults.push(cache[cacheKey]);
          } else {
            const result = await fetchWithRetryAndTimeout(() => model.generateContentStream({ contents: [contents] }), currentFile);
            let aggregatedResult = '';

            try {
              for await (let response of result.stream) {
                if (response.text) {
                  aggregatedResult += response.text();
                } else {
                  throw new Error("Response stream did not contain text.");
                }
              }

              // Extract just the phone number using regex
              const phoneMatch = aggregatedResult.match(/(?:^|\D)((?:62|0)8\d{8,11})(?:\D|$)/);
              if (phoneMatch) {
                aggregatedResult = phoneMatch[1].replace(/^08/, '628');
              }

              cache[cacheKey] = aggregatedResult;
              currentResults.push(aggregatedResult);
            } catch (streamError) {
              console.error("Error parsing stream:", streamError);
              output.innerHTML += `<p>Error parsing stream for file: ${currentFile.name}. ${streamError.message}</p>`;
              failedFiles.push(currentFile);
            }
          }
          console.log(`Finished processing file: ${currentFile.name}`);
          displayResultsForPage(currentPage);
        } catch (error) {
          console.error("Error processing file:", error);
          output.innerHTML += `<p>Failed to process file: ${currentFile.name}. Error: ${error.message}</p>`;
          failedFiles.push(currentFile);
        }
      }
      await sleep(4000); // Tunggu 4 detik antara setiap batch
    }

    // Proses ulang file yang gagal setelah semua file berhasil diproses
    if (failedFiles.length > 0) {
      output.innerHTML += `<p>Retrying failed files...</p>`;
      processingIndex = 0; // Reset index untuk pemrosesan ulang
      for (const failedFile of failedFiles) {
        try {
          // Lakukan pemrosesan ulang untuk setiap file yang gagal
          console.log(`Processing file: ${failedFile.name}`);
          const imageBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result.split(',')[1]);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(failedFile);
          });

          const contents = {
            role: 'user',
            parts: [
              { inline_data: { mime_type: failedFile.type, data: imageBase64 } },
              { text: promptInput.value }
            ]
          };

          const cacheKey = JSON.stringify(contents);

          const result = await fetchWithRetryAndTimeout(() => model.generateContentStream({ contents: [contents] }), failedFile);
          let aggregatedResult = '';

          for await (let response of result.stream) {
            if (response.text) {
              aggregatedResult += response.text();
            } else {
              throw new Error("Response stream did not contain text.");
            }
          }

          // Extract just the phone number using regex
          const phoneMatch = aggregatedResult.match(/(?:^|\D)((?:62|0)8\d{8,11})(?:\D|$)/);
          if (phoneMatch) {
            aggregatedResult = phoneMatch[1].replace(/^08/, '628');
          }

          currentResults.push(aggregatedResult);
          console.log(`Finished processing file: ${failedFile.name}`);
          displayResultsForPage(currentPage);
        } catch (error) {
          console.error("Error processing failed file:", error);
          output.innerHTML += `<p>Failed to process file: ${failedFile.name}. Error: ${error.message}</p>`;
        }
      }
    }

    isProcessing = false;
    downloadButton.style.display = 'block';

    // Fungsi untuk mengunduh hasil
    downloadButton.onclick = async () => {
      const formattedResults = currentResults.map(nomor => {
        return nomor.replace(/-/g, '').replace(/\s/g, '').replace(/^08/, '628');
      });
      const worksheet = XLSX.utils.json_to_sheet(formattedResults.map(nomor => ({ NomorTelepon: nomor })));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Nomor Telepon");
      XLSX.writeFile(workbook, "nomor_telepon.xlsx");
    }
  } catch (e) {
    output.innerHTML += '<hr>' + e;
  }
};

refreshButton.onclick = function () {
  location.reload();
};


// You can delete this once you've filled out an API key
maybeShowApiKeyBanner(API_KEY);
