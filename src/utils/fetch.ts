

import path from "path";
import client from "https";

import fetch from "node-fetch";
import fs from "fs-extra";
import Downloader from "nodejs-file-downloader";


const cacheDirectory = path.join(process.cwd(), "cache/fetch");
const fetchOptions = {
    headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,de;q=0.8,pt;q=0.7,af;q=0.6",
        "sec-ch-ua": "\"Google Chrome\";v=\"95\", \"Chromium\";v=\"95\", \";Not A Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "Windows",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36"
        
    }
}


await fs.ensureDir(cacheDirectory);


const errorResponse = (error: unknown): [undefined, Error, boolean] => {

    if(error instanceof Error){

        return [undefined, error, false];

    }

    return [undefined, new Error(String(error)), false];

};


export const fetchText = async (url: string, retries=3): Promise<[string, undefined, boolean] | [undefined, Error, boolean]> => {

    const cachePath = path.join(cacheDirectory, url);
    const exists = await fs.pathExists(cachePath);

    if(exists){

        const cache = await fs.readFile(cachePath);

        if(cache.toString()){

            return [cache.toString(), undefined, true];

        }else{

            await fs.rm(cachePath);

        }

    }

    await fs.ensureDir(path.dirname(cachePath));

    try{

        const response = await fetch(url, fetchOptions);
        const body = await response.text();

        if(body){

            await fs.writeFile(cachePath, body);

            return [body, undefined, false];
    
        }
    
        return [undefined, new Error(`Blank response from fetchText: ${ url }`), false];

    }catch(error: unknown){

        if(retries > 0){

            await new Promise((resolve) => setTimeout(resolve, 1000));

            console.log(`Retry ${ url } | ${ retries - 1 } remaining`);

            return fetchText(url, retries - 1);

        }

        return errorResponse(error);

    }

};

export const fetchJSON = async <ResponseType>(url: string): Promise<[ResponseType, undefined, boolean] | [undefined, Error, boolean]> => {

    const [fetchTextResponse, fetchTextError, fetchTextCached] = await fetchText(url);
    const cachePath = path.join(cacheDirectory, url);

    if(fetchTextError){

        await fs.rm(cachePath);

        return [undefined, fetchTextError, false];

    }

    try{

        if(fetchTextResponse){

            return [JSON.parse(fetchTextResponse) as ResponseType, undefined, fetchTextCached];

        }

        return errorResponse(`Blank response from fetchJSON ${ url }`);


    }catch(error: unknown){

        await fs.rm(cachePath);

        return errorResponse(error);

    }

};


export const downloadImage = async (url: string, filepath: string): Promise<void> => {
    
    const downloader = new Downloader({     
        url,     
        directory: path.dirname(filepath), 
        fileName: path.basename(filepath),
        maxAttempts:3
    }) 
    
    await downloader.download();

};
