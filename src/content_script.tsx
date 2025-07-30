console.log("GSC Bulk Remover content script loaded");

// Variables to track popup state
let popup: HTMLElement | null = null;
let currentChunkIndexElement: HTMLElement | null = null;
let totalChunksElement: HTMLElement | null = null;
let currentIndexElement: HTMLElement | null = null;

// Function to create and show the popup
function createAndShowPopup() {
  if (popup) return; // Popup already exists
  
  // Inject our CSS
  const style = document.createElement('link');
  style.href = chrome.runtime.getURL('website-popup.css');
  style.type = 'text/css';
  style.rel = 'stylesheet';
  (document.head || document.documentElement).appendChild(style);

  // Create and inject the popup HTML with chunk information only
  const popupHTML = `
    <div class="gsc-remover-popup" id="gsc-remover-popup">
      <div class="gsc-remover-popup-header">
        <h3 class="gsc-remover-popup-title">GSC Bulk Remover - Progress</h3>
        <button class="gsc-remover-popup-close" id="gsc-remover-close">×</button>
      </div>
      <div class="gsc-remover-popup-body">
        <div class="chunk-info">
          <div class="chunk-item">
            <label>Current Chunk:</label>
            <span id="current-chunk-index">0</span>
          </div>
          <div class="chunk-item">
            <label>Total Chunks:</label>
            <span id="total-chunks">0</span>
          </div>
          <div class="chunk-item">
            <label>Current Index:</label>
            <span id="current-index">0</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add the popup to the page
  const popupContainer = document.createElement('div');
  popupContainer.innerHTML = popupHTML;
  document.body.appendChild(popupContainer);
  
  // Get DOM elements
  popup = document.getElementById('gsc-remover-popup');
  const closeButton = document.getElementById('gsc-remover-close');
  currentChunkIndexElement = document.getElementById('current-chunk-index');
  totalChunksElement = document.getElementById('total-chunks');
  currentIndexElement = document.getElementById('current-index');

  // Close button handler
  closeButton?.addEventListener('click', () => {
    popup?.remove();
    popup = null;
  });
}



// Define interface for chunk state
interface ChunkState {
  currentChunkIndex: number;
  totalChunks: number;
  index: number;
  totalUrls: number;
}

// Update UI based on chunk state
function updateChunkUI(state: ChunkState) {
  if (!popup) return;
  
  if (currentChunkIndexElement) {
    currentChunkIndexElement.textContent = (state.currentChunkIndex + 1).toString();
  }
  
  if (totalChunksElement) {
    totalChunksElement.textContent = state.totalChunks.toString();
  }
  
  if (currentIndexElement) {
    currentIndexElement.textContent = (state.index + 1).toString()+"/"+(state.totalUrls).toString();
  }
}
let processUrls: string[] = [];

// No need for message listeners since we handle chunk updates directly

// Add a listener for messages from the popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === "startProcessing") {
        console.log("Start processing requested", message.data);
        processUrls=[];
        linksResubmission();
        sendResponse({ status: "Processing started" });
        return true;
    }
    
    if (message.action === "stopProcessing") {
        console.log("Stop processing requested");
        chrome.storage.local.set({ 'stopRequested': true }, () => {
            sendResponse({ status: "Stopping process" });
        });
        return true;
    }
});

// Main function to process URLs
function linksResubmission() {
    console.log("Starting URL removal process");

    chrome.storage.local.get([
        "URLs",
        "totalURLCount",
        "stopRequested",
        "currentChunkIndex",
        "totalChunks",
        "index",
    ], function(data) {
        if (data.stopRequested) {
            console.log("Process was stopped by user. Exiting.");
            return;
        }

        const urls = data.URLs

        if (!urls || !urls.includes("http")) {
            alert(getMessage("noValidUrls"));
            return;
        }

        const allUrls = urls.split("\n");
        if (allUrls.length === 0) {
            alert(getMessage("noValidUrls"));
            return;
        }

        const chunkIndex = data.currentChunkIndex || 0;
        const chunksTotal = data.totalChunks || Math.ceil(allUrls.length / 100);
        const startIndex = chunkIndex * 100;
        const endIndex = Math.min(startIndex + 100, allUrls.length);
        const urlListTrimmed = allUrls.slice(startIndex, endIndex);


        console.log(`Processing chunk ${chunkIndex + 1} of ${chunksTotal} (URLs ${startIndex + 1} to ${endIndex} of ${allUrls.length})`);

        // Create and show the popup when process starts
        createAndShowPopup();
        
        // Update initial chunk information
        updateChunkUI({
            currentChunkIndex: chunkIndex,
            totalChunks: chunksTotal,
            index: 0,
            totalUrls: urlListTrimmed.length
        });

        async function removeUrlJs(index: number, urlList: string[]) {
            if (index >= urlList.length) {
                console.log("Completed processing all URLs in current chunk");
                if(chunkIndex + 1< chunksTotal){
                    await new Promise<void>(resolve => 
                      chrome.storage.local.set({
                        currentChunkIndex: chunkIndex + 1,
                        lastUpdateTime: Date.now()
                      }, () => resolve())
                  );
                  setTimeout(() => linksResubmission(), 1500);
                  return;
                }
                if(currentIndexElement){
                  currentIndexElement.textContent ="Hoàn thành";
                }
              
                return ;
            }

            const stopData = await new Promise<any>(resolve => chrome.storage.local.get(['stopRequested'], resolve));
            if (stopData.stopRequested) {
                console.log("Process stopped by user during URL processing.");
                return;
            }

            try {
               // Update chunk information in the website popup
               updateChunkUI({
                currentChunkIndex: chunkIndex,
                totalChunks: chunksTotal,
                index: index + 1,
               totalUrls: urlList.length
            });
                await clickButton(["Yêu cầu mới","New request"]);
                await urlToSubmissionBar(urlList, index);
                await new Promise(resolve => setTimeout(resolve, 500));
                await clickButton(["tiếp", "tiếp theo", "next"],500);
                await clickButton(["Gửi yêu cầu","Submit request"],2000);
                await clickButton(["Đóng","Close"],500);
                
                await new Promise<void>(resolve => 
                    chrome.storage.local.set({
                        index: index + 1,
                        lastUpdateTime: Date.now()
                    }, () => resolve())
                );

               

                setTimeout(() => removeUrlJs(index + 1, urlList), 1500);
            } catch (error) {
                console.error(`Error processing URL ${urlList[index]}:`, error);
                setTimeout(() => removeUrlJs(index + 1, urlList), 1500);
            }
        }

        async function urlToSubmissionBar(urlList: string[], index: number) {
          const urlInput = document.querySelector('.Ufn6O.PPB5Hf input[type="text"]');
            if (urlInput) {
                (urlInput as HTMLInputElement).value = urlList[index];
                const inputEvent = new Event('input', { bubbles: true });
                urlInput.dispatchEvent(inputEvent);
                console.log(`Entered URL: ${urlList[index]}`);
            } else {
                throw new Error("URL input field not found");
            }
        }
        async function clickButton(text: string[],timer:number=3000, selector: string='.CwaK9 .RveJvd.snByac'){
          const button = Array.from(document.querySelectorAll(selector)).find((button: any) => {
            const buttonText = button.textContent.trim().toLowerCase();
            for(const txt of text){
              if(buttonText===txt.trim().toLocaleLowerCase()){
                return true;
              }
            }
            return false;
          })
          if (button) {
            const clickEvent = new Event('click', { bubbles: true });
            button.dispatchEvent(clickEvent);
          } else {
            console.log(text);
            throw new Error(" Button not found");
          }
          await new Promise(resolve => setTimeout(resolve, timer));
        }
        function getMessage(key: string, ...args: any[]): string {
            const messages: any = {
                vi: {
                    noValidUrls: "Vui lòng nhập ít nhất một URL hợp lệ.",
                    allProcessed: `Tất cả URL đã được xử lý! Tổng số đã gửi: ${args[0]}, Tổng số thất bại: ${args[1]}`
                },
                en: {
                    noValidUrls: "Please insert at least one valid URL.",
                    allProcessed: `All URLs processed! Total submitted: ${args[0]}, Total failed: ${args[1]}`
                }
            };
            const lang = document.documentElement.lang.includes('vi') ? 'vi' : 'en';
            return messages[lang][key] || messages.en[key];
        }

        // Start processing
        removeUrlJs(0, urlListTrimmed);
    });
}
