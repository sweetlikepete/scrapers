

import path from "path";

import cheerio from "cheerio";
import cliProgress from "cli-progress";
import colors from "colors";
import db from "better-sqlite3";
import fs from "fs-extra";

import { fetchText } from "../../../utils/fetch-text";


const outputDirectory = path.join(process.cwd(), "data/allmusic.com");
const startYear = 1960;
const incrementInDays = 7;
const now = new Date();
const fetchBatchSize = 10;


await fs.ensureDir(outputDirectory);


const database = db(path.join(outputDirectory, "artists.db"));

database.exec("CREATE TABLE IF NOT EXISTS artists(name STRING PRIMARY KEY);");


/**
 * Date formatted compatible with the url format https://www.allmusic.com/newreleases/all/${ date }
 */
const formatDate = (date: Date): string => {

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${ year }${ month }${ day }`;

};


const getBatches = (): string[][] => {

    const dates = [];
    const date = new Date(startYear, 0, 1);

    while(date.getTime() < now.getTime()){

        dates.push(formatDate(date));

        date.setDate(date.getDate() + incrementInDays);

    }

    const batches = [];

    while(dates.length > 0){

        const batch = dates.splice(0, fetchBatchSize);

        batches.push(batch);

    }

    return batches;

};


const batches = getBatches();
const total = batches.flat().length;
const bar = new cliProgress.SingleBar({
    format: `${ colors.cyan(" {bar}") } {percentage}% | ETA: {eta}s | {value}/{total}`
}, cliProgress.Presets.shades_classic);

bar.start(total, 0);

let completed = 0;


for(const batch of getBatches()){

    const batchResponse = await Promise.all(batch.map(async (date): Promise<string[]> => {

        const url = `https://www.allmusic.com/newreleases/all/${ date }`;
        const [body, error] = await fetchText(url);
        const batchNames: string[] = [];

        if(error){

            console.log(`Error fetching ${ url }`);

        }else if(body){

            const page = cheerio.load(body);

            page("td.artist a").each((index, element) => {

                const name = page(element).text();
                const query = `INSERT or REPLACE INTO artists(name) VALUES ('${ name.replaceAll("'", "") }');`;

                database.exec(query);

                batchNames.push(page(element).text());

            });

        }

        return batchNames;

    }));

    completed += batchResponse.length;

    bar.update(completed);

    // Console.log(`Completed batch ${ completed } of ${ total }: total ${ names.length }`);

}
