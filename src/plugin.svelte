<!--
    This plugin have different UI for desktop and mobile devices,
    since it uses mobileUI: small configuration.render

    For mobile devices the list of boat is stacked horizontally.
-->
<section class="plugin__content">
    <button class="back-btn" on:click={goBack}>Back</button>
    <h2>Indonesia AQMS Stations</h2>
    {#if loading}
        <p>Loading stations...</p>
    {:else if error}
        <p class="error">{error}</p>
    {:else if stations.length === 0}
        <p>No stations found.</p>
    {:else}
        <ul class="station-list">
            {#each stations as station, i}
                <li class="station-item" on:click={() => focusStation(i)}>
                    <strong>{station.name}</strong><br />
                    <span>{station.address}</span><br />
                    AQI: <b>{station.aqi_value}</b> ({station.aqi_parameter})<br />
                    <small>{station.timestamp}</small>
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
        aqi_value: number;
        aqi_parameter: string;
        timestamp: string;
    };

    let stations: Station[] = [];
    let markers: any[] = [];
    let loading = true;
    let error: string | null = null;

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

    async function fetchStations() {
        loading = true;
        error = null;
        try {
            const res = await fetch('https://api-klhk.aertrax.id/aqms/stations/geojson');
            if (!res.ok) throw new Error('Failed to fetch data');
            const resJson = await res.json();
            const features = resJson.data.features;

            stations = features.map((feature: any) => {
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

            // Remove old markers
            removeMarkers();

            markers = stations.map(station => {
                const popupHtml = `<b>${station.name}</b><br>${station.address}<br>AQI: <b>${station.aqi_value}</b> (${station.aqi_parameter})<br><small>${station.timestamp}</small>`;
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
        } catch (e) {
            error = e.message || 'Unknown error';
        } finally {
            loading = false;
        }
    }

    function focusStation(index: number) {
        const station = stations[index];
        map.setView([station.lat, station.lon], 12);
        markers[index].openPopup();
    }

    function removeMarkers() {
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];
    }

    function goBack() {
        bcast.emit('rqstOpen', 'menu');
    }

    export const onopen = () => {
        fetchStations();
    };

    onMount(() => {});
    onDestroy(() => {
        removeMarkers();
    });
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
</style>
