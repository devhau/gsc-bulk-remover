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

        async function removeUrlJs(index: number, urlList: string[]) {
            if (index >= urlList.length) {
                console.log("Completed processing all URLs in current chunk");
                await new Promise<void>(resolve => 
                  chrome.storage.local.set({
                    currentChunkIndex: chunkIndex + 1,
                    lastUpdateTime: Date.now()
                  }, () => resolve())
              );
              setTimeout(() => linksResubmission(), 1500);
                return ;
            }

            const stopData = await new Promise<any>(resolve => chrome.storage.local.get(['stopRequested'], resolve));
            if (stopData.stopRequested) {
                console.log("Process stopped by user during URL processing.");
                return;
            }

            try {
                await clickButton(["Yêu cầu mới","New request"]);
                await urlToSubmissionBar(urlList, index);
                await new Promise(resolve => setTimeout(resolve, 500));
                await clickButton(["tiếp", "tiếp theo", "next"],500);
                await clickButton(["Gửi yêu cầu","Submit request"],2000);
                await clickButton(["Đóng","Close"],500);
                await removeProcessedUrl(urlList[index]);
                
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
            
               await new Promise<void>(resolve => 
                chrome.runtime.sendMessage({
                  action: 'urlRemoved',
                  remainingUrls: updatedUrls,
                  removedUrl: processedUrl
              },() => resolve())
              );
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
