/*
 * This file is part of BlueMap, licensed under the MIT License (MIT).
 *
 * Copyright (c) Blue (Lukas Rieger) <https://bluecolored.de>
 * Copyright (c) contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
package de.bluecolored.bluemap.common.web;

import de.bluecolored.bluemap.common.web.http.HttpHeader;
import de.bluecolored.bluemap.common.web.http.HttpRequest;
import de.bluecolored.bluemap.common.web.http.HttpRequestHandler;
import de.bluecolored.bluemap.common.web.http.HttpResponse;
import de.bluecolored.bluemap.common.web.http.HttpStatusCode;
import lombok.Getter;
import lombok.NonNull;
import lombok.Setter;
import org.jetbrains.annotations.Nullable;

import java.nio.charset.StandardCharsets;
import java.util.function.Supplier;
import java.util.zip.CRC32C;

@Getter @Setter
public class JsonDataRequestHandler implements HttpRequestHandler {

    private @NonNull Supplier<String> dataSupplier;

    // Memoized ETag for the last data-string, identity-compared to avoid re-hashing
    // the same (cached) data on every request. Guarded by the lock below.
    private final Object eTagLock = new Object();
    private @Nullable String lastData = null;
    private @Nullable String lastETag = null;

    public JsonDataRequestHandler(Supplier<String> dataSupplier) {
        this.dataSupplier = dataSupplier;
    }

    @Override
    public HttpResponse handle(HttpRequest request) {
        String data = dataSupplier.get();
        String eTag = eTag(data);

        // If the client already has this exact version, tell it nothing changed instead
        // of re-sending the (potentially large) body. The webapp fetches these files with
        // cache: "no-cache", so the browser revalidates with If-None-Match automatically
        // and transparently serves its cached body on a 304 - no client-side changes needed.
        if (eTag != null) {
            HttpHeader ifNoneMatch = request.getHeader("If-None-Match");
            if (ifNoneMatch != null && ifNoneMatch.contains(eTag)) {
                HttpResponse notModified = new HttpResponse(HttpStatusCode.NOT_MODIFIED);
                notModified.addHeader("Cache-Control", "no-cache");
                notModified.addHeader("ETag", eTag);
                return notModified;
            }
        }

        HttpResponse response = new HttpResponse(HttpStatusCode.OK);
        response.addHeader("Cache-Control", "no-cache");
        response.addHeader("Content-Type", "application/json");
        if (eTag != null) response.addHeader("ETag", eTag);
        response.setBody(data);
        return response;
    }

    /**
     * Computes a content-based ETag for the given data. The result is memoized: as long as
     * the supplier keeps returning the same (cached) string instance, the hash is reused.
     * A content-based tag means an unchanged marker-/player-set keeps the same ETag even
     * after the supplier regenerates an identical-but-new string, so 304s keep working.
     */
    private @Nullable String eTag(@Nullable String data) {
        if (data == null) return null;
        synchronized (eTagLock) {
            //noinspection StringEquality - intentional identity check to skip re-hashing cached data
            if (data != lastData) {
                lastData = data;
                // CRC32C compiles to a hardware CRC instruction (SSE4.2 / ARM CRC) and runs in a single
                // native call - this is only a cache-validator, so speed beats collision-resistance.
                CRC32C crc = new CRC32C();
                crc.update(data.getBytes(StandardCharsets.UTF_8));
                lastETag = '"' + Long.toHexString(crc.getValue()) + '"';
            }
            return lastETag;
        }
    }

}
