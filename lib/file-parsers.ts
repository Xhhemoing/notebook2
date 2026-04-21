export const loadPdfJs = async (): Promise<any> => {
  if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
    return (window as any).pdfjsLib;
  }
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      if ((window as any).pdfjsLib) {
        resolve((window as any).pdfjsLib);
      } else {
        reject(new Error('PDF.js loaded but pdfjsLib not found on window'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js from CDN'));
    document.head.appendChild(script);
  });
};

export async function parsePDF(file: File): Promise<{ pageNumber: number, textContent: string }[]> {
  console.log('Starting PDF parse via CDN for file:', file.name, 'Size:', file.size);
  
  try {
    const pdfjsLib = await loadPdfJs();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      useSystemFonts: true,
      disableFontFace: false,
    });
    
    const pdf = await loadingTask.promise;
    console.log('PDF loaded successfully, pages:', pdf.numPages);
    
    const pages: { pageNumber: number, textContent: string }[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        
        // Extract text directly (much faster than OCR)
        const textContentObj = await page.getTextContent();
        const textContent = textContentObj.items.map((item: any) => item.str).join(' ');

        pages.push({
          pageNumber: i,
          textContent
        });
        console.log(`Extracted text from page ${i}/${pdf.numPages}`);
      } catch (pageErr) {
        console.error(`Failed to extract text from page ${i}:`, pageErr);
      }
    }

    if (pages.length === 0) {
      throw new Error('未能从 PDF 中提取任何页面');
    }

    return pages;
  } catch (err: any) {
    console.error('PDF parsing error:', err);
    throw new Error(`PDF 解析失败: ${err.message || '未知错误'}`);
  }
}

export async function parseDocx(file: File): Promise<{ content: string }> {
  console.log('Starting DOCX parse for file:', file.name);
  try {
// @ts-ignore
    const mammoth = await import('mammoth/mammoth.browser.js');
    const mammothLib = mammoth.default || mammoth;
    
    if (!mammothLib || !mammothLib.extractRawText) {
      throw new Error('Word 解析库加载失败：未找到 extractRawText 方法');
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammothLib.extractRawText({ arrayBuffer });
    
    if (result.messages.length > 0) {
      console.warn('Mammoth messages:', result.messages);
    }

    return { content: result.value };
  } catch (err: any) {
    console.error('DOCX parsing error:', err);
    throw new Error(`Word 解析失败: ${err.message || '未知错误'}`);
  }
}
