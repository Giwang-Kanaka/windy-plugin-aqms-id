<!--
    This plugin have different UI for desktop and mobile devices,
    since it uses mobileUI: small configuration.render

    For mobile devices the list of boat is stacked horizontally.
-->
<section class="plugin__content">
    <button class="back-btn" on:click={goBack}>Back</button>
    <h2>Indonesia AQMS Stations</h2>
    <div
        style="margin-bottom: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;"
    >
        <input
            type="text"
            placeholder="Search by name or address..."
            bind:value={searchQuery}
            style="padding: 6px; border-radius: 4px; border: 1px solid #ccc; min-width: 180px;"
        />
        <select
            bind:value={sortBy}
            style="padding: 6px; border-radius: 4px; border: 1px solid #ccc;"
        >
            <option value="name">Sort by Name</option>
            <option value="latest_aqi">Sort by AQI</option>
            <option value="vendor__name">Sort by Vendor</option>
        </select>
        <button
            on:click={() => (sortAsc = !sortAsc)}
            style="padding: 6px 10px; border-radius: 4px; border: 1px solid #ccc; background: #f7f7f7; cursor: pointer;"
        >
            {sortAsc ? 'Asc' : 'Desc'}
        </button>
    </div>
    {#if loading}
        <p>Loading stations...</p>
    {:else if error}
        <p class="error">{error}</p>
    {:else if stations.length === 0}
        <p>No stations found.</p>
    {:else}
        <ul class="station-list">
            {#each stations as station}
                <li class="station-item" on:click={() => focusStation(station.id)}>
                    <strong>{station.name}</strong><br />
                    <span>{station.address}</span><br />
                    <span>Vendor: {station.vendor_name}</span><br />
                    AQI: <b>{station.aqi_value}</b> ({station.aqi_parameter})<br />
                    <small>{formatTimestamp(station.timestamp)}</small>
                </li>
            {/each}
        </ul>
    {/if}
</section>

<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { map } from '@windy/map';
    import bcast from '@windy/broadcast';
    // @ts-ignore: L is provided globally by Windy/Leaflet
    declare const L: any;

    type Station = {
        id: string;
        name: string;
        address: string;
        lat: number;
        lon: number;
        vendor_name: string;
        aqi_value: number;
        aqi_parameter: string;
        timestamp: string;
    };

    let stations: Station[] = [];
    let geojsonStations: Station[] = [];
    let markers: any[] = [];
    let loading = true;
    let error: string | null = null;
    let searchQuery = '';
    let sortBy: 'name' | 'latest_aqi' | 'vendor__name' = 'name';
    let sortAsc = true;

    function getAqiColor(aqi: number): { bg: string; fg: string } {
        if (aqi >= 300) return { bg: 'black', fg: 'white' };
        if (aqi >= 200) return { bg: 'red', fg: 'white' };
        if (aqi >= 101) return { bg: 'yellow', fg: 'black' };
        if (aqi >= 51) return { bg: 'blue', fg: 'white' };
        return { bg: 'green', fg: 'white' };
    }

    function createAqiIcon(aqi: number): any {
        const { bg, fg } = getAqiColor(aqi);
        return L.divIcon({
            className: 'aqi-marker',
            html: `<div style="
                width:30px;
                height:30px;
                border-radius:50%;
                background:${bg};
                color:${fg};
                border:2px solid #000;
                box-shadow:0 2px 6px rgba(0,0,0,0.2);
                font-weight:bold;
                font-size:13px;
                display:flex;
                align-items:center;
                justify-content:center;
                line-height:26px;
                text-align:center;
                box-sizing:border-box;
                margin:0;
                padding:0;">
                ${aqi}
            </div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
            popupAnchor: [0, -13],
        });
    }

    // Fetch geojson stations for the map
    async function fetchGeojsonStations() {
        try {
            const res = await fetch('https://api-klhk.aertrax.id/aqms/stations/geojson');
            if (!res.ok) throw new Error('Failed to fetch geojson data');
            const resJson = await res.json();
            const features = resJson.data.features;
            geojsonStations = features.map((feature: any) => {
                const props = feature.properties;
                const coords = feature.geometry.coordinates;
                return {
                    id: feature.id,
                    name: props.name || 'Unnamed Station',
                    address: props.address || '',
                    lat: coords[1],
                    lon: coords[0],
                    aqi_value: props.latest_aqi?.aqi_value ?? 0,
                    aqi_parameter: props.latest_aqi?.aqi_parameter ?? '',
                    timestamp: props.latest_aqi?.timestamp ?? '',
                };
            });
        } catch (e) {
            // Optionally handle geojson error
        }
    }

    // Fetch stations for the list (search/sort)
    async function fetchStations() {
        loading = true;
        error = null;
        try {
            // Build query params for search and sort
            const params = new URLSearchParams();
            if (searchQuery.trim()) params.append('search', searchQuery.trim());
            // sort param: prefix with '-' if descending
            if (sortBy) params.append('sort', sortAsc ? sortBy : `-${sortBy}`);
            const url = `https://api-klhk.aertrax.id/aqms/stations?${params.toString()}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch data');
            const resJson = await res.json();
            stations = resJson.data.map((station: any) => ({
                id: station.id,
                name: station.name || 'Unnamed Station',
                address: station.address || '',
                lat: station.location?.coordinates?.[1],
                lon: station.location?.coordinates?.[0],
                vendor_name: station.vendor?.name || '',
                aqi_value: station.latest_aqi?.aqi_value ?? 0,
                aqi_parameter: station.latest_aqi?.aqi_parameter ?? '',
                timestamp: station.latest_aqi?.timestamp ?? '',
            }));
        } catch (e) {
            error = e.message || 'Unknown error';
        } finally {
            loading = false;
        }
    }

    // Set up map markers from geojsonStations
    $: if (geojsonStations.length) {
        removeMarkers();
        markers = geojsonStations.map(station => {
            const popupHtml = `
                <div class="custom-popup">
                    <div class="popup-time">${formatTimestamp(station.timestamp)}</div>
                    <hr class="popup-divider" />
                    <div class="popup-row"><span class="popup-label">ID:</span><span class="popup-value">${station.id}</span></div>
                    <div class="popup-row"><span class="popup-label">Nama Stasiun:</span><span class="popup-value popup-bold">${station.name}</span></div>
                    <div class="popup-row"><span class="popup-label">Nilai ISPU:</span><span class="popup-value"><span class="popup-aqi-badge">${station.aqi_value}</span></span></div>
                    <div class="popup-row"><span class="popup-label">Alamat Stasiun:</span><span class="popup-value popup-address">${station.address}</span></div>
                    <div class="popup-row"><span class="popup-label">Status Stasiun:</span><span class="popup-value"><span class="popup-status-dot"></span><span class="popup-status-active">Active</span></span></div>
                    <button class="popup-detail-btn" onclick="window.open('https://klhk.aertrax.id/stations/${station.id}', '_blank', 'noopener')">Lihat Detail</button>
                </div>
            `;
            return new L.Marker([station.lat, station.lon], {
                icon: createAqiIcon(station.aqi_value),
            })
                .addTo(map)
                .bindPopup(popupHtml);
        });
        if (markers.length > 0) {
            const group = new L.featureGroup(markers);
            map.fitBounds(group.getBounds());
        }
    }

    function focusStation(id: string) {
        // Find the geojson station and marker by id
        const idx = geojsonStations.findIndex(s => s.id === id);
        if (idx !== -1) {
            const station = geojsonStations[idx];
            map.setView([station.lat, station.lon], 12);
            markers[idx]?.openPopup();
        }
    }

    function removeMarkers() {
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];
    }

    function goBack() {
        bcast.emit('rqstOpen', 'menu');
    }

    // Fetch geojson stations once on open
    export const onopen = () => {
        fetchGeojsonStations();
        fetchStations();
    };

    onMount(() => {});
    onDestroy(() => {
        removeMarkers();
    });

    // Fetch stations whenever searchQuery, sortBy, or sortAsc change
    $: ([searchQuery, sortBy, sortAsc], fetchStations());

    // Add a helper to format timestamp
    function formatTimestamp(ts: string): string {
        if (!ts) return '';
        const date = new Date(ts);
        if (isNaN(date.getTime())) return ts;
        // Determine Indonesian time zone
        const offset = -date.getTimezoneOffset() / 60; // user's local offset in hours
        let tz = '';
        if (offset === 7) tz = 'WIB';
        else if (offset === 8) tz = 'WITA';
        else if (offset === 9) tz = 'WIT';
        const months = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
        ];
        const day = date.getDate().toString().padStart(2, '0');
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        const hour = date.getHours().toString().padStart(2, '0');
        const min = date.getMinutes().toString().padStart(2, '0');
        return `${day} ${month} ${year}, ${hour}:${min}${tz ? ' ' + tz : ''}`;
    }
</script>

<style>
    .plugin__content {
        padding: 10px;
    }
    .back-btn {
        margin-bottom: 10px;
        padding: 6px 16px;
        font-size: 14px;
        border: none;
        border-radius: 4px;
        background: #eee;
        cursor: pointer;
        font-weight: bold;
    }
    .back-btn:hover {
        background: #ddd;
    }
    .station-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .station-item {
        padding: 8px;
        border-bottom: 1px solid #eee;
        cursor: pointer;
    }
    .station-item:hover {
        background: #f5f5f5;
    }
    .error {
        color: red;
    }
    .aqi-marker-inner {
        width: 36px;
        height: 36px;
        border-radius: 50% !important;
        background: green;
        color: white;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 15px;
        border: 3px solid #fff;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        overflow: hidden;
        aspect-ratio: 1 / 1;
    }
    .see-detail-btn {
        display: inline-block;
        margin-top: 8px;
        padding: 6px 16px;
        background: #009688;
        color: #fff;
        border-radius: 4px;
        border: none;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
        transition: background 0.2s;
    }
    .see-detail-btn:hover {
        background: #00796b;
    }
    .custom-popup {
        font-family: inherit;
        min-width: 260px;
        max-width: 320px;
        color: #fff;
        background: rgba(40, 40, 40, 0.95);
        border-radius: 18px;
        padding: 18px 18px 12px 18px;
        box-sizing: border-box;
    }
    .popup-time {
        font-size: 18px;
        font-weight: 500;
        margin-bottom: 8px;
        letter-spacing: 1px;
    }
    .popup-divider {
        border: none;
        border-top: 1px solid #888;
        margin: 8px 0 12px 0;
    }
    .popup-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
        font-size: 16px;
    }
    .popup-label {
        font-weight: 500;
        color: #fff;
        min-width: 120px;
        text-align: left;
    }
    .popup-value {
        text-align: right;
        color: #bfc9d1;
        max-width: 160px;
        word-break: break-word;
    }
    .popup-bold {
        font-weight: bold;
        color: #fff;
    }
    .popup-aqi-badge {
        display: inline-block;
        background: #3a3be0;
        color: #fff;
        border-radius: 16px;
        padding: 2px 16px;
        font-size: 18px;
        font-weight: bold;
        min-width: 36px;
        text-align: center;
    }
    .popup-address {
        color: #aab6c8;
        font-size: 15px;
    }
    .popup-status-dot {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #00e676;
        margin-right: 6px;
        vertical-align: middle;
    }
    .popup-status-active {
        color: #00e676;
        font-weight: bold;
        font-size: 16px;
        vertical-align: middle;
    }
    .popup-detail-btn {
        display: block;
        width: 100%;
        margin: 18px 0 0 0;
        padding: 12px 0;
        background: linear-gradient(90deg, #009688 0%, #008080 100%);
        color: #fff;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        font-weight: bold;
        font-size: 20px;
        letter-spacing: 1px;
        transition: background 0.2s;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }
    .popup-detail-btn:hover {
        background: linear-gradient(90deg, #00796b 0%, #006060 100%);
    }
</style>
