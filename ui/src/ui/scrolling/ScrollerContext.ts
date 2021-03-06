import { SelectDeps } from "ui/Application";
import Page from "ui/platform/dom/Page";
import ContentScroller, { ContentScrollerOpts } from "ui/ui/scrolling/ContentScroller";
import FixedItemListScroller, {
    DisplayableItem,
    FixedItemListScrollerOpts,
} from "ui/ui/scrolling/FixedItemListScroller";

type Deps = SelectDeps<"page">;
interface Opts {
    itemHeight: number;
}

export default class ScrollerContext {
    private itemHeight: number;
    private page: Page;

    constructor({ itemHeight }: Opts, { page }: Deps) {
        this.itemHeight = itemHeight;
        this.page = page;
    }

    createContentScroller(opts: ContentScrollerOpts) {
        const { page } = this;
        return new ContentScroller(opts, { page });
    }

    createFixedItemListScroller<T extends DisplayableItem>(opts: FixedItemListScrollerOpts<T>) {
        const { itemHeight, page } = this;
        opts.itemHeight = itemHeight;
        return new FixedItemListScroller<T>(opts, { page });
    }
}
