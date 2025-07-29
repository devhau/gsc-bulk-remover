console.log("GSC Bulk Remover content script loaded");

// Add a listener for messages from the popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === "startProcessing") {
        console.log("Start processing requested", message.data);
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
        "temporaryRemoval",
        "totalURLCount",
        "processedURLCount",
        "stopRequested"
    ], function(data) {
        if (data.stopRequested) {
            console.log("Process was stopped by user. Exiting.");
            return;
        }

        const urls = data.URLs;
        const isTemporary = data.temporaryRemoval !== undefined ? data.temporaryRemoval : true;

        if (!urls || !urls.includes("http")) {
            alert(getMessage("noValidUrls"));
            return;
        }

        const allUrls = urls.split("\n").map((url: string) => url.trim()).map((url: string) => url.split(',')[0]).filter((url: string) => url.length > 2 && url.startsWith("http"));
        if (allUrls.length === 0) {
            alert(getMessage("noValidUrls"));
            return;
        }

        const chunkIndex = data.currentChunkIndex || 0;
        const chunksTotal = data.totalChunks || Math.ceil(allUrls.length / 100);
        const startIndex = chunkIndex * 100;
        const endIndex = Math.min(startIndex + 100, allUrls.length);
        const urlListTrimmed = allUrls.slice(startIndex, endIndex);

        let currentProcessedCount = data.processedURLCount || 0;

        console.log(`Processing chunk ${chunkIndex + 1} of ${chunksTotal} (URLs ${startIndex + 1} to ${endIndex} of ${allUrls.length})`);

        async function removeUrlJs(index: number, urlList: string[]) {
            if (index >= urlList.length) {
                console.log("Completed processing all URLs in current chunk");
                return;
            }

            const stopData = await new Promise<any>(resolve => chrome.storage.local.get(['stopRequested'], resolve));
            if (stopData.stopRequested) {
                console.log("Process stopped by user during URL processing.");
                return;
            }

            try {
                await clickNewRequestButton();
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                await urlToSubmissionBar(urlList, index);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                await submissionNextButton();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                await submitRequest();
                await new Promise(resolve => setTimeout(resolve, 2000));
                await closeButton();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                await removeProcessedUrl(urlList[index]);
                currentProcessedCount++;
                
                await new Promise<void>(resolve => 
                    chrome.storage.local.set({
                        processedURLCount: currentProcessedCount,
                        lastUpdateTime: Date.now()
                    }, () => resolve())
                );

                setTimeout(() => removeUrlJs(index + 1, urlList), 1500);
            } catch (error) {
                console.error(`Error processing URL ${urlList[index]}:`, error);
                setTimeout(() => removeUrlJs(index + 1, urlList), 1500);
            }
        }
        async function clickNewRequestButton() {
          clickButton(["Yêu cầu mới","New request"])
        }

        async function urlToSubmissionBar(urlList: string[], index: number) {
            const selectors = [
                '.Ufn6O.PPB5Hf input[type="text"]',
            ];
            
            let urlInput: HTMLInputElement | HTMLTextAreaElement | null = null;
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                urlInput = elements[0] as HTMLInputElement | HTMLTextAreaElement;
                if (urlInput) break;
            }

            if (urlInput) {
                urlInput.value = urlList[index];
                const inputEvent = new Event('input', { bubbles: true });
                urlInput.dispatchEvent(inputEvent);
                console.log(`Entered URL: ${urlList[index]}`);
            } else {
                throw new Error("URL input field not found");
            }
        }
        function getButtonByText(text: string[], selector: string='.CwaK9 .RveJvd.snByac') {
          const button = Array.from(document.querySelectorAll(selector)).find((button: any) => {
            const buttonText = button.textContent.trim().toLowerCase();
            for(const txt of text){
              if(buttonText===txt.trim().toLocaleLowerCase()){
                return true;
              }
            }
            return false;
          })
          return button;
        }
        function clickButton(text: string[], selector: string='.CwaK9 .RveJvd.snByac'){
          const button = getButtonByText(text, selector);
          if (button) {
            const clickEvent = new Event('click', { bubbles: true });
            button.dispatchEvent(clickEvent);
          } else {
            console.log(text);
            throw new Error(" Button not found");
          }
        }
        async function submissionNextButton() {
          clickButton(["tiếp", "tiếp theo", "next"]);
        }

        async function submitRequest() {
          clickButton(["Gửi yêu cầu","Submit request"]);
        }
        async function closeButton() {
          clickButton(["Đóng","Close"]);
        }
        
        async function removeProcessedUrl(processedUrl: string) {
          try {
            // Get current URLs from storage
            const data = await new Promise<any>(resolve => 
              chrome.storage.local.get(['URLs'], resolve)
            );
            
            if (data.URLs) {
              // Split URLs into array, remove the processed URL, and rejoin
              const urlArray = data.URLs.split('\n')
                .map((url: string) => url.trim())
                .filter((url: string) => url !== processedUrl && url.length > 0);
              
              const updatedUrls = urlArray.join('\n');
              
              // Save updated URLs back to storage
              await new Promise<void>(resolve => 
                chrome.storage.local.set({ URLs: updatedUrls }, () => resolve())
              );
              
              console.log(`Removed processed URL: ${processedUrl}`);
              console.log(`Remaining URLs: ${urlArray.length}`);
                // Send message to popup to update UI
                chrome.runtime.sendMessage({
                    action: 'urlRemoved',
                    remainingUrls: updatedUrls,
                    removedUrl: processedUrl
                });
            }
          } catch (error) {
            console.error('Error removing processed URL:', error);
          }
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
