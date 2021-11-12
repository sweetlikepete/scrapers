

import fetch from "node-fetch";


export const fetchText = async (path: string): Promise<[string | undefined] | [undefined, Error]> => {

    try{

        const response = await fetch(path);
        const body = await response.text();

        return [body, undefined] as unknown as [string | undefined];

    }catch(error: unknown){

        if(error instanceof Error){

            return [undefined, error];

        }

        return [undefined, new Error(String(error))];

    }

};
