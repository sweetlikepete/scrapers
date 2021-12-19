

import path from "path";

import cliProgress from "cli-progress";
import colors from "colors";
import db from "better-sqlite3";
import fs from "fs-extra";

import {
    downloadImage,
    fetchJSON
} from "../../utils/fetch";


interface ITunesSearchResponse{
    resultCount: number;
    results: {
        wrapperType: "collection";
        collectionType: string | "Album";
        artistId: number;
        collectionId: number;
        artistName: string;
        collectionName: string;
        collectionCensoredName: string;
        artistViewUrl: string;
        collectionViewUrl: string;
        artworkUrl60: string;
        artworkUrl100: string;
        collectionPrice: number;
        collectionExplicitness: string;
        trackCount: number;
        copyright: string;
        country: string;
        currency: string;
        releaseDate: string;
        primaryGenreName: string;
    }[];
}


const limit = 200;
const requestDelay = 500; // Itunes api limits you to 20 calls per minute, which is 3000 ms
const artistNamesDatabasePath = path.join(process.cwd(), "data/allmusic.com", "artist-names.db");
const artistNamesDatabaseExists = await fs.pathExists(artistNamesDatabasePath);
const outputDirectory = path.join(process.cwd(), "data/itunes");
const outputIndexLength = 4;
const completedDatabasePath = path.join(outputDirectory, "completed-artist-names.db");

await fs.ensureDir(outputDirectory);

const completedArtistNamesDatabase = db(completedDatabasePath);

completedArtistNamesDatabase.exec("CREATE TABLE IF NOT EXISTS artists(name STRING PRIMARY KEY, completes INT);");


if(!artistNamesDatabaseExists){

    console.log(`Could not find artist name database ${ artistNamesDatabasePath }`);

    process.exit();

}

const completedArtists = completedArtistNamesDatabase.prepare("SELECT * FROM artists").all();

const completedArtistNames = completedArtistNamesDatabase.prepare("SELECT * FROM artists").all()
.map((item: { name: string }) => item.name)
.filter(Boolean)
.filter((item) => typeof item === "string");


const artistNamesDatabase = db(artistNamesDatabasePath);
const artistNames = artistNamesDatabase.prepare("SELECT * FROM artists").all()
.map((item: { name: string }) => item.name)
.filter(Boolean)
.filter((item) => typeof item === "string");


const bar = new cliProgress.SingleBar({
    format: `${ colors.cyan(" {bar}") } {percentage}% | ETA: {eta}s | batch: {value}/{total} | errors: {totalErrors} | total: {globalTotal}`
}, cliProgress.Presets.shades_classic);
let total = 0;
let totalErrors = 0;

bar.start(artistNames.length, 0);


for(const artistName of artistNames){

    if(completedArtistNames.includes(artistName)){

        total += completedArtists.find((item) => item.name === artistName).completes;

        bar.increment(1, {
            globalTotal: total,
            totalErrors
        });

    }else{

        const artist = artistName.replaceAll(/[^0-9a-zA-Z ]/gu, "").replaceAll(" ", "+");
        const albumSearchUrl = `https://itunes.apple.com/search?term=${ artist.toLocaleLowerCase() }&limit=${ limit }&entity=album`;
        const [response, error, cached] = await fetchJSON<ITunesSearchResponse>(albumSearchUrl);
        const completes: string[] = [];

        if(error){

            // Console.log(` Error downloading ${ albumSearchUrl }`);
            totalErrors += 1;

        }else{

            const albums = response!.results.filter((item) => item.collectionType === "Album");

            let errors = false;

            if(albums.length > 0){

                const batchCompletes = await Promise.all(albums.map(async (album): Promise<string> => {

                    const id = String(album.collectionId);
                    const outputFolder = path.join(outputDirectory, `${ id.slice(id.length - outputIndexLength) }`);
                    const outputImage = path.join(outputFolder, `${ id }.jpg`);
                    const outputJSON = path.join(outputFolder, `${ id }.jpg.json`);
                    const imageExists = await fs.pathExists(outputImage);
                    const jsonExists = await fs.pathExists(outputJSON);
                    const imageUrl = album.artworkUrl100.replace("source/100x100", "source/500x500");

                    if(!jsonExists || !imageExists){

                        await fs.ensureDir(outputFolder);

                        if(!jsonExists){

                            try{

                                await fs.writeFile(outputJSON, JSON.stringify(album));

                            }catch{

                                // Console.log(` Error writing json: ${ outputJSON }`);

                                return "";

                            }

                        }

                        if(!imageExists){

                            try{

                                await downloadImage(imageUrl, outputImage);

                            }catch{

                                // Console.log(` Error writing image: ${ imageUrl }`);

                                return "";

                            }

                        }

                    }

                    return String(album.artistId);

                }));

                const successes = batchCompletes.filter(Boolean);

                errors = successes.length !== batchCompletes.length;

                completes.push(...successes);

                totalErrors += batchCompletes.length - successes.length;

            }

            if(!errors){

                const query = `INSERT or REPLACE INTO artists(name, completes) VALUES ('${ artistName }', ${ completes.length })`;

                completedArtistNamesDatabase.exec(query);

            }

            total += completes.length;

            bar.increment(1, {
                globalTotal: total,
                totalErrors
            });

            if(!cached){

                await new Promise((resolve) => {

                    setTimeout(resolve, requestDelay);

                });

            }

        }


    }

}

bar.stop();
