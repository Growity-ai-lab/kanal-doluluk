import * as XLSX from 'xlsx';
import { format, parse } from 'date-fns';

const MAX_AD_DURATION_PER_HOUR = 720; // 12 mins per hour limit

const getPtOptType = (hour) => {
    if (hour < 7 || hour > 25) return null;
    return (hour >= 7 && hour < 18) ? 'OPT' : 'PT';
};

const parseTimeValue = (val) => {
    if (!val) return null;
    const str = String(val).trim();
    if (str.includes(':')) {
        const [h, m] = str.split(':');
        return { hour: parseInt(h, 10), minute: parseInt(m, 10) };
    }
    if (str.length >= 4) {
        return { hour: parseInt(str.substring(0, 2), 10), minute: parseInt(str.substring(2, 4), 10) };
    }
    return null;
};

const parseDurationToSeconds = (val) => {
    if (typeof val === 'number') return val;
    const str = String(val).trim();
    if (str.includes(':')) {
        const parts = str.split(':').map(p => parseInt(p, 10) || 0);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parseFloat(str) || 0;
};

export const FileProcessor = {
    async processExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

                    const ratingData = [];
                    const occupancyMap = {};

                    // Skip header
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row || row.length < 13) continue;

                        const kanal = String(row[2] || '');
                        const tarihVal = row[3];
                        let tarih = '';

                        if (typeof tarihVal === 'number') {
                            const dt = XLSX.SSF.parse_date_code(tarihVal);
                            tarih = `${dt.y}-${String(dt.m).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`;
                        } else {
                            tarih = String(tarihVal || '');
                        }

                        const baslangic = String(row[8] || '');
                        const duration = parseDurationToSeconds(row[12]);
                        const timeInfo = parseTimeValue(baslangic);

                        if (kanal && tarih && duration > 0 && timeInfo) {
                            const { hour } = timeInfo;
                            const ptOpt = getPtOptType(hour);

                            if (ptOpt) {
                                const key = `${tarih}_${kanal}_${hour}_${ptOpt}`;
                                if (!occupancyMap[key]) {
                                    occupancyMap[key] = { tarih, kanal, hour, ptOpt, totalDuration: 0 };
                                }
                                occupancyMap[key].totalDuration += duration;

                                ratingData.push({
                                    kanal, tarih, baslangic, duration,
                                    hour, ptOpt,
                                    brand: String(row[0] || ''),
                                    program: String(row[6] || '')
                                });
                            }
                        }
                    }

                    const occupancyData = Object.values(occupancyMap).map(item => ({
                        ...item,
                        occupancyPercentage: (item.totalDuration / MAX_AD_DURATION_PER_HOUR) * 100
                    }));

                    resolve({ ratingData, occupancyData });
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },

    async processCSV(file) {
        // Similar logic to Excel but using a csv parser or simple split
        // For now, redirect to processExcel as XLSX can often handle CSV too
        return this.processExcel(file);
    }
};
