

import path from "path";
import client from "https";

import fetch from "node-fetch";
import fs from "fs-extra";

const cacheDirectory = path.join(process.cwd(), "cache/fetch");


await fs.ensureDir(cacheDirectory);


const errorResponse = (error: unknown): [undefined, Error] => {

    if(error instanceof Error){

        return [undefined, error];

    }

    return [undefined, new Error(String(error))];

};


export const fetchText = async (url: string): Promise<[string, undefined] | [undefined, Error]> => {

    const cachePath = path.join(cacheDirectory, url);
    const exists = await fs.pathExists(cachePath);

    if(exists){

        const cache = await fs.readFile(cachePath);

        return [cache.toString(), undefined];

    }

    await fs.ensureDir(path.dirname(cachePath));

    try{

        const response = await fetch(url);
        const body = await response.text();

        await fs.writeFile(cachePath, body);

        return [body, undefined];

    }catch(error: unknown){

        return errorResponse(error);

    }

};

export const fetchJSON = async <ResponseType>(url: string): Promise<[ResponseType, undefined] | [undefined, Error]> => {

    const [fetchTextResponse, fetchTextError] = await fetchText(url);

    if(fetchTextError){

        return [undefined, fetchTextError];

    }

    try{

        if(fetchTextResponse){

            return [JSON.parse(fetchTextResponse) as ResponseType, undefined];

        }

        return errorResponse("Blank response from fetch");


    }catch(error: unknown){

        return errorResponse(error);

    }

};


export const downloadImage = async (url: string, filepath: string): Promise<string> => new Promise((resolve, reject) => {

    const successCode = 200;

    client.get(url, (response) => {
        if(response.statusCode === successCode){
            response.pipe(fs.createWriteStream(filepath))
            .on("error", reject)
            .once("close", () => {
                resolve(filepath);
            });
        }else{
            // Consume response data to free up memory
            response.resume();
            reject(new Error(`Request Failed With a Status Code: ${ String(response.statusCode) }`));

        }
    });

});
