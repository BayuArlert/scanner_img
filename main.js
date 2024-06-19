import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import Base64 from 'base64-js';
import MarkdownIt from 'markdown-it';
import { maybeShowApiKeyBanner } from './gemini-api-banner';
import './style.css';

// 🔥 FILL THIS OUT FIRST! 🔥
// 🔥 GET YOUR GEMINI API KEY AT 🔥
// 🔥 https://g.co/ai/idxGetGeminiKey 🔥
let API_KEY = 'AIzaSyDvBWOtPihSRB7L7N-mfyxu5UBzcyge6i0';

let form = document.querySelector('form');
let promptInput = document.querySelector('input[name="prompt"]');
let output = document.querySelector('.output');
let imageInput = document.getElementById('imageInput');
let downloadButton = document.createElement('button'); // Tombol unduh baru
downloadButton.textContent = 'Unduh Hasil';
downloadButton.style.display = 'none'; // Sembunyikan tombol awalnya
document.body.appendChild(downloadButton);

form.onsubmit = async (ev) => {
  ev.preventDefault();
  output.textContent = 'Generating...';
  downloadButton.style.display = 'none'; // Sembunyikan tombol saat pemindaian baru dimulai

  try {
    const files = imageInput.files;
    const contentsArray = [];

    for (let i = 0; i < files.length; i++) {
      const currentFile = files[i];
      const reader = new FileReader();

      // Use a Promise to handle asynchronous file reading
      const imageBase64 = await new Promise((resolve, reject) => {
        reader.onload = (event) => {
          // Extract Base64 data correctly (remove data URL prefix)
          const base64Data = event.target.result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(currentFile);
      });

      contentsArray.push([
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: currentFile.type, data: imageBase64 } },
            { text: promptInput.value } // Use the same prompt for all images
          ]
        }
      ]);
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-pro-vision",
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    });

    for (const contents of contentsArray) {
      const result = await model.generateContentStream({ contents });

      // Read from the stream and interpret the output as markdown
      let buffer = [];
      let md = new MarkdownIt();
      for await (let response of result.stream) {
        buffer.push(response.text());
        output.innerHTML += md.render(buffer.join(''));
      }
    }

    // Tampilkan tombol unduh setelah pemindaian selesai
    downloadButton.style.display = 'block';

    // Tambahkan event listener untuk tombol unduh
    downloadButton.onclick = () => {
      const textContent = output.textContent;
      const blob = new Blob([textContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'output.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    output.innerHTML += '<hr>' + e;
  }
};

// You can delete this once you've filled out an API key
maybeShowApiKeyBanner(API_KEY);