import cheerio from 'cheerio'
import {
    APIWrapper,
    Chapter,
    SearchRequest,
    Source
} from 'paperback-extensions-common'
import { ColoredManga } from '../ColoredManga/ColoredManga'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

describe('Colored Manga Tests', () => {

    const wrapper: APIWrapper = new APIWrapper()
    const source: Source = new ColoredManga(cheerio)
    const expect = chai.expect
    chai.use(chaiAsPromised)

    /**
   * The Manga ID which this unit test uses to base it's details off of.
   * Try to choose a manga which is updated frequently, so that the historical checking test can
   * return proper results, as it is limited to searching 30 days back due to extremely long processing times otherwise.
   */
    const mangaId = 'one-piece-official-english'

    it('Retrieve Manga Details', async () => {
        const details = await wrapper.getMangaDetails(source, mangaId)
        expect(details, 'No results found with test-defined ID [' + mangaId + ']')
            .to.exist

        // Validate that the fields are filled
        const data = details
        expect(data.titles, 'Missing Titles').to.be.not.empty
        expect(data.image, 'Missing Image').to.be.not.empty
        expect(data.status, 'Missing Status').to.exist
    })

    it('Get Chapters', async () => {
        const volumes: Chapter[] = await wrapper.getChapters(source, mangaId)
        const entry = testData(volumes)
        expect(entry?.volume, "No volume nember available").to.not.be.NaN

        const noVolumes: Chapter[] = await wrapper.getChapters(source, "kingdom")
        testData(noVolumes)

        function testData(data: Chapter[]) {
            expect(data, 'No chapters present for: [' + mangaId + ']').to.not.be.empty

            const entry = data[0]
            expect(entry?.id, 'No ID present').to.not.be.empty
            expect(entry?.name, 'No title available').to.not.be.empty
            expect(entry?.chapNum, 'No chapter number present').to.not.be.null
            expect(entry?.time, "No time available").to.not.be.null
            return entry
        }

    })

    it('Get Chapter Details', async () => {
        const data = await wrapper.getChapterDetails(source, mangaId, "volume-1/chapter-8")
        expect(data, 'No server response').to.exist
        expect(data, 'Empty server response').to.not.be.empty

        expect(data.id, 'Missing ID').to.be.not.empty
        expect(data.mangaId, 'Missing MangaID').to.be.not.empty
        expect(data.pages, 'No pages present').to.be.not.empty
    })

    it('Testing search', async () => {
        const testSearch: SearchRequest = {
            title: 'one piece',
            parameters: {
                includedTags: []
            }
        }

        const search = await wrapper.searchRequest(source, testSearch, 1)
        const result = search.results[0]

        expect(result, 'No response from server').to.exist
        expect(result?.id, 'No ID found for search query').to.be.not.empty
        expect(result?.image, 'No image found for search').to.be.not.empty
        expect(result?.title, 'No title').to.be.not.null
        expect(result?.subtitleText, 'No subtitle text').to.be.not.null
    })

})
