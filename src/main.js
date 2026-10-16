import './style.css';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

document.querySelector('#app').innerHTML = `
  <div class="container">
    <header>
      <h1>Lyrics Extractor</h1>
      <p>Instantly extract lyrics from chord sheets</p>
    </header>
    <main>
      <div class="input-section">
        <label for="file-upload">Upload your chord sheet (PDF or Text):</label>
        <div class="upload-area">
          <input type="file" id="file-upload" accept=".pdf,.txt" />
        </div>
        <div class="or-divider">OR</div>
        <label for="chords-input">Paste your chord sheet here:</label>
        <textarea id="chords-input" placeholder="Paste chords and lyrics here..."></textarea>
      </div>
      <div class="actions">
        <button id="extract-btn">Extract Lyrics</button>
      </div>
      <div class="output-section">
        <label for="lyrics-output">Extracted Lyrics:</label>
        <textarea id="lyrics-output" readonly placeholder="Your extracted lyrics will appear here..."></textarea>
      </div>
    </main>
  </div>
`;

const isChord = (word) => {
  const chordRegex = /^[A-G][b#]?(m|maj|min|dim|aug|sus)?\d*(\/[A-G][b#]?)?$/i;
  const structRegex = /^(intro|verse|chorus|bridge|outro|interlude|tag|ending|v\d|c\d|ch|pre-chorus|instrumental)\.?$/i;
  return chordRegex.test(word) || structRegex.test(word);
};

const extractLyrics = (text) => {
  const lines = text.split('\n');
  const lyricsLines = [];
  
  for (let line of lines) {
    let originalLine = line;
    let normalizedLine = line.replace(/\.+/g, ' ').trim();
    
    if (normalizedLine.length === 0) {
      lyricsLines.push('');
      continue;
    }
    
    if (normalizedLine.startsWith('[') && normalizedLine.endsWith(']')) {
      continue;
    }

    const words = normalizedLine.split(/\s+/).filter(w => w.length > 0);
    
    let chordCount = 0;
    for (let word of words) {
      const cleanWord = word.replace(/^[^\w#]+|[^\w#]+$/g, '');
      if (isChord(cleanWord)) {
        chordCount++;
      }
    }
    
    const chordRatio = chordCount / words.length;
    if (chordRatio > 0.4) {
      continue;
    }
    
    if (words.length > 3 && chordRatio > 0.3 && normalizedLine.includes(',')) {
       const commaCount = (normalizedLine.match(/,/g) || []).length;
       if (commaCount > 3) {
          continue;
       }
    }

    let cleanedLyrics = originalLine.replace(/\.+/g, ' ').trim();
    cleanedLyrics = cleanedLyrics.replace(/^(V\d|Chorus|Ch|Intro)\s*/i, '');
    
    lyricsLines.push(cleanedLyrics);
  }
  
  return lyricsLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const extractTextFromPDF = async (arrayBuffer) => {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Sort items primarily by Y coordinate (descending), then X coordinate (ascending)
    // PDF coordinates are typically bottom-left origin, so higher Y means higher on page
    const items = textContent.items.map(item => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      height: item.height
    }));
    
    // Group into lines based on Y coordinate (allowing small tolerance)
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    
    let lines = [];
    let currentLineY = null;
    let currentLine = [];
    
    for (const item of items) {
      if (currentLineY === null || Math.abs(currentLineY - item.y) > 3) {
        if (currentLine.length > 0) {
          // Sort current line by X and join
          currentLine.sort((a, b) => a.x - b.x);
          // Insert spaces between items based on X gap if needed
          let lineStr = '';
          let lastX = null;
          for (const lItem of currentLine) {
            // Rough heuristic for space
            if (lastX !== null && (lItem.x - lastX) > 10) {
              lineStr += ' ';
            }
            lineStr += lItem.str;
            lastX = lItem.x + lItem.str.length * 5; // very rough estimate of width
          }
          lines.push(lineStr);
        }
        currentLine = [item];
        currentLineY = item.y;
      } else {
        currentLine.push(item);
      }
    }
    
    if (currentLine.length > 0) {
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine.map(i => i.str).join(' '));
    }
    
    fullText += lines.join('\n') + '\n\n';
  }
  return fullText;
};

document.getElementById('file-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const extractBtn = document.getElementById('extract-btn');
  extractBtn.disabled = true;
  extractBtn.textContent = 'Processing File...';
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    let text = '';
    
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      text = await extractTextFromPDF(arrayBuffer);
    } else {
      // Assuming it's a text file
      text = new TextDecoder('utf-8').decode(arrayBuffer);
    }
    
    document.getElementById('chords-input').value = text;
    
    // Auto-extract
    const output = extractLyrics(text);
    document.getElementById('lyrics-output').value = output;
  } catch (error) {
    console.error('Error reading file:', error);
    alert('Failed to extract text from file. Ensure it is a valid PDF or Text file.');
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = 'Extract Lyrics';
  }
});

document.getElementById('extract-btn').addEventListener('click', () => {
  const input = document.getElementById('chords-input').value;
  const output = extractLyrics(input);
  document.getElementById('lyrics-output').value = output;
});
