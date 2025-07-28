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
        "downloadCheckbox",
        "temporaryRemoval",
        "currentChunkIndex",
        "totalChunks",
        "submittedLinksAll",
        "failedLinksAll",
        "totalURLCount",
        "processedURLCount",
        "stopRequested"
    ], function(data) {
        if (data.stopRequested) {
            console.log("Process was stopped by user. Exiting.");
            return;
        }

        const urls = data.URLs;
        const downloadResults = data.downloadCheckbox || false;
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

        const previousSubmittedLinks = data.submittedLinksAll || [];
        const previousFailedLinks = data.failedLinksAll || [];
        const submittedLinks: string[] = [];
        const failedLinks: string[] = [];
        let currentProcessedCount = data.processedURLCount || 0;

        console.log(`Processing chunk ${chunkIndex + 1} of ${chunksTotal} (URLs ${startIndex + 1} to ${endIndex} of ${allUrls.length})`);

        async function removeUrlJs(index: number, urlList: string[]) {
            if (index >= urlList.length) {
                await saveChunkResults();
                return;
            }

            const stopData = await new Promise<any>(resolve => chrome.storage.local.get(['stopRequested'], resolve));
            if (stopData.stopRequested) {
                console.log("Process stopped by user during URL processing.");
                return;
            }

            try {
                await clickNewRequestButton(isTemporary);
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                await urlToSubmissionBar(urlList, index, isTemporary);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                await submissionNextButton();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const submitButtonFound = await submitRequest();
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                await checkOutcome(urlList, index, submitButtonFound);
                
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
                failedLinks.push(urlList[index]);
                setTimeout(() => removeUrlJs(index + 1, urlList), 1500);
            }
        }

        async function saveChunkResults() {
            const updatedSubmittedLinksAll = [...previousSubmittedLinks, ...submittedLinks];
            const updatedFailedLinksAll = [...previousFailedLinks, ...failedLinks];

            await new Promise<void>(resolve => 
                chrome.storage.local.set({
                    submittedLinksAll: updatedSubmittedLinksAll,
                    failedLinksAll: updatedFailedLinksAll,
                    lastUpdateTime: Date.now()
                }, () => resolve())
            );

            const stopData = await new Promise<any>(resolve => chrome.storage.local.get(['stopRequested'], resolve));
            if (stopData.stopRequested) {
                console.log("Process stopped by user before moving to next chunk.");
                return;
            }

            if (chunkIndex + 1 < chunksTotal) {
                console.log(`Completed chunk ${chunkIndex + 1} of ${chunksTotal}. Submitted: ${submittedLinks.length}, Failed: ${failedLinks.length}.`);
                await new Promise<void>(resolve => 
                    chrome.storage.local.set({
                        currentChunkIndex: chunkIndex + 1,
                        lastUpdateTime: Date.now()
                    }, () => resolve())
                );
                setTimeout(() => location.reload(), 3000);
            } else {
                const finalMessage = getMessage("allProcessed", updatedSubmittedLinksAll.length, updatedFailedLinksAll.length);
                alert(finalMessage);
                
                await new Promise<void>(resolve => 
                    chrome.storage.local.set({
                        currentChunkIndex: 0,
                        isProcessing: false,
                        lastUpdateTime: Date.now()
                    }, () => resolve())
                );

                if (downloadResults) {
                    downloadResultsFile(updatedSubmittedLinksAll, updatedFailedLinksAll);
                }
            }
        }

        async function clickNewRequestButton(temporaryRemoval: boolean) {
            const newRequestButtonLabels = {
                vi: "Yêu cầu mới",
                en: "New request"
            };
            const cacheButtonLabels = {
                vi: "Xóa URL đã lưu trong bộ nhớ đệm",
                en: "Clear cached URL"
            };

            const selectors = [
                '.RveJvd.snByac',
                'button[aria-label*="new request" i]',
                'button[aria-label*="Yêu cầu mới" i]',
                'button[data-action="new-request"]',
                'button'
            ];

            let newRequestButton: HTMLButtonElement | null = null;
            for (const selector of selectors) {
                newRequestButton = Array.from(document.querySelectorAll(selector)).find((button: any) => {
                    const text = button.textContent.trim().toLowerCase();
                    return text === newRequestButtonLabels.vi.toLowerCase() || 
                           text === newRequestButtonLabels.en.toLowerCase() ||
                           button.getAttribute('aria-label')?.toLowerCase().includes('new request') ||
                           button.getAttribute('aria-label')?.toLowerCase().includes('yêu cầu mới');
                }) as HTMLButtonElement;
                if (newRequestButton) break;
            }

            if (newRequestButton) {
                newRequestButton.click();
                console.log("Clicked New Request button");
                if (!temporaryRemoval) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const buttonsArray = document.getElementsByClassName('kx3Hed VZhFab');
                    const clearCacheButton = Array.from(buttonsArray).find((button: any) => 
                        button.textContent.trim() === cacheButtonLabels.vi || 
                        button.textContent.trim() === cacheButtonLabels.en
                    ) as HTMLButtonElement;
                    if (clearCacheButton) {
                        clearCacheButton.click();
                        console.log("Clicked Clear Cache button");
                    } else {
                        console.log("Cache button not found, skipping cache removal.");
                    }
                }
            } else {
                throw new Error("New request button not found");
            }
        }

        async function urlToSubmissionBar(urlList: string[], index: number, temporaryRemoval: boolean) {
            const selectors = [
                'input[type="url"]',
                'input[name="url"]',
                '.Ufn6O.PPB5Hf input',
                '.Ufn6O.PPB5Hf textarea',
                'input[type="text"][aria-label*="URL" i]',
                'textarea[aria-label*="URL" i]',
                'input[placeholder*="URL" i]',
                'textarea[placeholder*="URL" i]'
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

        async function submissionNextButton() {
            const nextButtonLabels:any = {
                vi: ["tiếp", "tiếp theo"],
                en: ["next"]
            };
            const selectors = [
                '.CwaK9 .RveJvd.snByac'
            ];

            let nextButton: HTMLButtonElement | null = null;
            for (const selector of selectors) {
                nextButton = Array.from(document.querySelectorAll(selector)).find((button: any) => {
                    const text = button.textContent.trim().toLowerCase();
                    console.log("Next button text:", text);
                    for(var itemKey in Object.keys(nextButtonLabels)){
                      const itemValue = nextButtonLabels[itemKey];
                      console.log("Next button value:", itemValue);
                      if(itemValue?.includes(text)){
                        return true;
                      }
                    }
                    return false;
                    // return nextButtonLabels.vi.includes(text) || 
                    //        text === nextButtonLabels.en.toLowerCase() ||
                    //        button.getAttribute('aria-label')?.toLowerCase().includes('next') ||
                    //        button.getAttribute('aria-label')?.toLowerCase().includes('tiếp') ||
                    //        button.getAttribute('aria-label')?.toLowerCase().includes('tiếp theo');
                }) as HTMLButtonElement;
                if (nextButton) break;
            }

            if (nextButton && nextButton.childNodes[2]) {
                nextButton.removeAttribute('aria-disabled');
                nextButton.setAttribute('tabindex', '0');
                (nextButton.childNodes[2] as HTMLElement).click();
                console.log("Clicked Next button");
            } else {
                throw new Error("Next button not found");
            }
        }

        async function submitRequest(): Promise<boolean> {
            const submitButtonLabels = {
                vi: "Gửi yêu cầu",
                en: "Submit request"
            };
            const closeButtonLabels = {
                vi: "Đóng",
                en: "Close"
            };
            const buttons = document.querySelectorAll('.CwaK9 .RveJvd.snByac, button[aria-label*="submit" i], button[aria-label*="Gửi yêu cầu" i]');
            for (const button of buttons) {
                const text = (button as HTMLElement).textContent?.trim().toLowerCase() || '';
                if (text === submitButtonLabels.vi.toLowerCase() || text === submitButtonLabels.en.toLowerCase()) {
                    (button as HTMLButtonElement).click();
                    console.log("Clicked Submit button");
                    return true;
                }
                if (text === closeButtonLabels.vi.toLowerCase() || text === closeButtonLabels.en.toLowerCase()) {
                    return false;
                }
            }
            return false;
        }

        async function checkOutcome(urlList: string[], index: number, submitButtonFound: boolean) {
            const closeButtonLabels = {
                vi: "Đóng",
                en: "Close"
            };
            const errorMessages = document.querySelectorAll('.PNenzf');
            if (errorMessages.length > 0) {
                failedLinks.push(urlList[index]);
                console.log(`Failed, ${urlList[index]} already exists as a submitted request.`);
                const closeButton = document.querySelectorAll('.CwaK9 .RveJvd.snByac, button[aria-label*="close" i], button[aria-label*="Đóng" i]');
                for (const button of closeButton) {
                    const text = (button as HTMLElement).textContent?.trim().toLowerCase() || '';
                    if (text === closeButtonLabels.vi.toLowerCase() || 
                        text === closeButtonLabels.en.toLowerCase()) {
                        (button as HTMLButtonElement).click();
                        console.log("Clicked Close button");
                    }
                }
            } else if (!submitButtonFound) {
                failedLinks.push(urlList[index]);
                console.log(`Failed to submit ${urlList[index]}`);
                const closeButton = document.querySelectorAll('.CwaK9 .RveJvd.snByac, button[aria-label*="close" i], button[aria-label*="Đóng" i]');
                for (const button of closeButton) {
                    const text = (button as HTMLElement).textContent?.trim().toLowerCase() || '';
                    if (text === closeButtonLabels.vi.toLowerCase() || 
                        text === closeButtonLabels.en.toLowerCase()) {
                        (button as HTMLButtonElement).click();
                        console.log("Clicked Close button");
                    }
                }
            } else {
                submittedLinks.push(urlList[index]);
                console.log(`Submitted ${urlList[index]}`);
            }
        }

        function downloadResultsFile(submittedLinksAll: string[], failedLinksAll: string[]) {
            const labels = {
                vi: { submitted: "Liên kết đã gửi", failed: "Liên kết thất bại" },
                en: { submitted: "Submitted links", failed: "Failed links" }
            };
            const lang = document.documentElement.lang.includes('vi') ? 'vi' : 'en';
            const txtContent = `${labels[lang].submitted}:\n${submittedLinksAll.join('\n')}\n\n${labels[lang].failed}:\n${failedLinksAll.join('\n')}`;
            const encodedUri = encodeURI(`data:text/plain;charset=utf-8,${txtContent}`);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', 'results.txt');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
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
