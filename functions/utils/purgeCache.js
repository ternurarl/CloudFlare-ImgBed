import { fetchOthersConfig } from "./sysConfig";

let othersConfig = {};
let cfZoneId = "";
let cfEmail = "";
let cfApiKey = "";

export async function purgeCFCache(env, cdnUrl) {
    try {
        // 读取其他设置
        othersConfig = await fetchOthersConfig(env);
        cfZoneId = othersConfig.cloudflareApiToken.CF_ZONE_ID;

        // 如果没有配置Zone ID，跳过缓存清除
        if (!cfZoneId) {
            return;
        }

        // 优先使用 Scoped API Token，回退到 Global API Key
        const cfApiToken = othersConfig.cloudflareApiToken.CF_API_TOKEN;
        const headers = {'Content-Type': 'application/json'};

        if (cfApiToken) {
            headers['Authorization'] = `Bearer ${cfApiToken}`;
        } else {
            cfEmail = othersConfig.cloudflareApiToken.CF_EMAIL;
            cfApiKey = othersConfig.cloudflareApiToken.CF_API_KEY;
            if (!cfEmail || !cfApiKey) {
                return;
            }
            headers['X-Auth-Email'] = cfEmail;
            headers['X-Auth-Key'] = cfApiKey;
        }

        // 清除CDN缓存
        const options = {
            method: 'POST',
            headers,
            body: `{"files":["${ cdnUrl }"]}`
        };
        await fetch(`https://api.cloudflare.com/client/v4/zones/${ cfZoneId }/purge_cache`, options);
    } catch (error) {
        console.error('Failed to purge CF cache:', error.message || error);
    }
}

export async function purgeRandomFileListCache(origin, ...dirs) {
    try {
        const cache = caches.default;
        // cache.delete有bug，通过写入一个max-age=0的response来清除缓存
        const nullResponse = new Response(null, {
            headers: { 'Cache-Control': 'max-age=0' },
        });

        for (const dir of dirs) {
            await cache.put(`${origin}/api/randomFileList?dir=${dir}`, nullResponse);
        }
    } catch (error) {
        console.error('Failed to clear randomFileList cache:', error);
    }
}

export async function purgePublicFileListCache(origin, ...dirs) {
    try {
        const cache = caches.default;
        // cache.delete有bug，通过写入一个max-age=0的response来清除缓存
        const nullResponse = new Response(null, {
            headers: { 'Cache-Control': 'max-age=0' },
        });

        for (const dir of dirs) {
            // 清除递归和非递归两种缓存
            await cache.put(`${origin}/api/publicFileList?dir=${dir}&recursive=false`, nullResponse);
            await cache.put(`${origin}/api/publicFileList?dir=${dir}&recursive=true`, nullResponse);
        }
    } catch (error) {
        console.error('Failed to clear publicFileList cache:', error);
    }
}