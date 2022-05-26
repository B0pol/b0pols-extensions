import {
    ContentRating,
    Source,
    SourceInfo,
    SearchRequest,
    Manga,
    PagedResults,
    Chapter,
    ChapterDetails,
    MangaTile,
    MangaStatus,
    LanguageCode,
} from 'paperback-extensions-common'

const CM_DOMAIN = "https://coloredmanga.com"

export const ColoredMangaInfo: SourceInfo = {
    version: '0.0.1',
    name: "ColoredManga",
    icon: "icon.png",
    author: "Bopol",
    description: "Extension that pulls manga from ColoredManga.",
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: CM_DOMAIN
}

export class ColoredManga extends Source {

    requestManager = createRequestManager({
        requestsPerSecond: 5,
    })

    async getMangaDetails(mangaId: string): Promise<Manga> {
        const request = createRequestObject({
            url: `${CM_DOMAIN}/manga/${mangaId}`,
            method: "GET"
        })
        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)

        const title: string = $(".post-title h1").first().text().trim()
        const image: string = $(".tab-summary .summary_image img").first().attr("src")?.trim() ?? ""
        const desc: string = $(".summary__content p").text().trim()

        let status: MangaStatus = MangaStatus.UNKNOWN

        const summaryContent = $(".tab-summary .summary_content")
        for (const item of $(".post-status .post-content_item", summaryContent).toArray()) {
            const information: string = $(".summary-heading", item).text().trim()
            if (information.toLowerCase() === "status") {
                const mangaStatus: string = $(".summary-content", item).text().trim()
                switch (mangaStatus.toUpperCase()) {
                    case "ONGOING":
                        status = MangaStatus.ONGOING
                        break
                    case "COMPLETED":
                        status = MangaStatus.COMPLETED
                        break
                    default:
                        status = MangaStatus.UNKNOWN
                        break
                }
            }
        }

        const averageRate = $("#averagerate", summaryContent).text().trim()
        const rating: number = parseFloat(averageRate)

        const covers: string[] = []
        let rawCover: string | undefined = $(".site-content .profile-manga.summary-layout-1").first().attr("style")?.trim() ?? ""
        rawCover = rawCover.replace("background-image:url(", "")
        rawCover = rawCover.split(")").shift()
        if (rawCover != undefined) {
            covers.push(rawCover)
        }

        return createManga({
            id: mangaId,
            titles: [title],
            image,
            desc,
            status,
            rating,
            covers
        })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({
            url: `${CM_DOMAIN}/manga/${mangaId}`,
            method: "GET"
        })
        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)

        /*
        For chapter number / volume number

        there is no indication given. 
        On top of that,the have read first and read last buttons which use first -> last in list, last -> first in list
        if it’s not the case (e.g. one piece english, where first -> first and last -> last)
        it won’t work, read first will show last and read last will show first
        
        So we try to extract the number from the string, and if it fails we calculate it
        based on first in last chapter/volume -> first in list
        */

        const chapters: Chapter[] = []
        const list = $(".page-content-listing ul.version-chap")

        // no volumes
        if (list.hasClass("no-volumn")) {
            const chaps = $("li.wp-manga-chapter", list).toArray()
            for (const [index, chap] of chaps.entries()) {
                const chapNum = chaps.length - index
                chapters.push(parseChapter(chap, chapNum))
            }
        } else {
            const volumes = $("li.parent.has-child").toArray()
            for (const [index, vol] of volumes.entries()) {
                const volumeTitle: string = $("a", vol).first().text().trim()
                const match = volumeTitle.match(/d+/)
                const numberString: string = (match === null) ? "" : match[0] ?? ""
                let volume: number = parseInt(numberString)
                volume = isNaN(volume) ? volumes.length - index : volume

                for (const chap of $("li.wp-manga-chapter", vol).toArray()) {
                    chapters.push(parseChapter(chap, 0, volume))
                }
            }
        }

        function parseChapter(elem: CheerioElement, chapNum: number, volume?: number) {
            const title: string = $("a", elem).first().text().trim()
            const match = title.match(/\d+/)
            const numberString: string = (match === null) ? "" : match[0] ?? ""
            let chapNumber: number = parseInt(numberString)

            // use the calculated number if parsing failed
            chapNumber = isNaN(chapNumber) ? chapNum : chapNumber

            let chapterId: string = $("a", elem).first().attr("href")?.trim() ?? ""
            if (chapterId.endsWith("/")) {
                chapterId = chapterId.slice(0, -1)
            }
            chapterId = chapterId.split("/").slice(5).join("/")

            let chapter: Chapter = {
                id: chapterId,
                mangaId,
                name: title,
                langCode: LanguageCode.UNKNOWN,
                chapNum: chapNumber
            }
            if (volume !== undefined) {
                chapter.volume = volume
            }

            let date: string | Date = $(".chapter-release-date", elem).text().trim()
            if (date !== "") {
                date = new Date(date)
                chapter.time = date
            }

            return createChapter(chapter)
        }

        return chapters
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = createRequestObject({
            url: `${CM_DOMAIN}/manga/${mangaId}/${chapterId}`,
            method: "GET"
        })
        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)

        const pages: string[] = []
        for (const content of $(".reading-content > div").toArray()) {
            const image = $("img", content)
            const img: string = image.first().attr("src")?.trim() ?? ""
            pages.push(img)
        }

        return createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: false
        })
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const url = new URL(CM_DOMAIN)
        url.searchParams.append("s", query?.title || '')
        url.searchParams.append("post_type", "wp-manga")

        const request = createRequestObject({
            url: url.toString(),
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)

        const mangaItems: MangaTile[] = []
        for (const manga of $(".c-tabs-item__content").toArray()) {
            const post_title = $(".post-title a", manga).first()
            const title = post_title.text().trim()
            let id: string = post_title.attr("href")?.trim() ?? ""
            if (id.endsWith("/")) {
                id = id.slice(0, -1)
            }
            id = id.split("/").pop() ?? "";
            const image = $(".tab-thumb img").first().attr("src") ?? ""

            mangaItems.push(createMangaTile({
                id,
                image,
                title: createIconText({ text: title }),
            }))

        }

        return createPagedResults({
            results: mangaItems
        })
    }
}