import { openDB } from 'idb';

const DB_NAME = 'KanalDolulukDB';
const DB_VERSION = 1;

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('ratingData')) {
                db.createObjectStore('ratingData', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('occupancyData')) {
                db.createObjectStore('occupancyData', { keyPath: 'id', autoIncrement: true });
            }
        },
    });
};

export const StorageService = {
    async saveRatingData(data) {
        const db = await initDB();
        const tx = db.transaction('ratingData', 'readwrite');
        // Clear and batch save for simplicity, but in production, we'd do incremental updates
        await tx.store.clear();
        for (const item of data) {
            await tx.store.add(item);
        }
        await tx.done;
    },

    async loadRatingData() {
        const db = await initDB();
        return db.getAll('ratingData');
    },

    async saveOccupancyData(data) {
        const db = await initDB();
        const tx = db.transaction('occupancyData', 'readwrite');
        await tx.store.clear();
        for (const item of data) {
            await tx.store.add(item);
        }
        await tx.done;
    },

    async loadOccupancyData() {
        const db = await initDB();
        return db.getAll('occupancyData');
    },

    async clearAll() {
        const db = await initDB();
        await db.clear('ratingData');
        await db.clear('occupancyData');
    }
};
