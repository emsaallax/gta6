// ГРУППА 2. Собирает город: карта, улицы, берег, здания, реквизит.
// Обязана: меши в e.scene, коробки домов в e.physics.addBox,
// и заполнить e.state.city по CONTRACTS §5.
import { createLayout } from './city/layout.js';
import { buildRoads, setPavedVisible, getPavedWetMats } from './city/roads.js';
import { buildBuildings, updateBuildings, applyBuildingPbr, getBuildingWindowMats } from './city/buildings.js';
import { buildShore, updateShore, setShoreSandVisible } from './city/shore.js';
import { buildProps, updateProps } from './city/props.js';
import { buildCityGraph, updateCityGraph } from './city/graph.js';
import { buildSkyline, updateSkyline, getSkylineWindowMats } from './city/skyline.js';
import { buildStreetDress, updateStreetDress, setLampSpotsVisible } from './city/streetDress.js';
import { buildBeachLife, updateBeachLife } from './city/beachLife.js';
import { buildHotelSigns, updateHotelSigns } from './city/hotelSigns.js';
import { loadFacadePBR, updatePbrFacades } from './city/pbrFacades.js';
import { loadGroundPBR, buildPbrGround, updatePbrGround, getGroundWetMats } from './city/pbrGround.js';
import { buildKenneyPalms, updateKenneyPalms } from './city/kenneyPalms.js';
import { buildKenneyDress, updateKenneyDress } from './city/kenneyDress.js';
import { buildNeonSigns, updateNeonSigns } from './city/neonSigns.js';
import { buildLampSpots, updateLampSpots } from './city/lampSpots.js';
import { buildPuddles, updatePuddles } from './city/puddles.js';
import { registerWetMat, updateWetSurfaces } from './city/wetSurfaces.js';
import { registerWindowMat, updateWindowNight } from './city/windowNight.js';

function setVisible(obj, on) {
  if (!obj) return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) setVisible(obj[i], on);
    return;
  }
  obj.visible = !!on;
}

function registerMats(list, register) {
  if (!list) return;
  for (let i = 0; i < list.length; i++) register(list[i]);
}

export class City {
  init(e) {
    const layout = createLayout();
    this._layout = layout;
    this._props = null;
    const roads = buildRoads(e, layout);
    buildShore(e, layout);
    buildBuildings(e, layout, { skipSigns: true });
    buildHotelSigns(e.scene, layout.lots);
    buildSkyline(e, layout);
    this._props = buildProps(e, layout);
    buildStreetDress(e, layout);
    buildBeachLife(e, layout);
    buildNeonSigns(e.scene, layout.lots, layout);
    buildLampSpots(e, layout);
    setLampSpotsVisible(false);
    buildPuddles(e, layout);
    registerMats(getBuildingWindowMats(), registerWindowMat);
    registerMats(getSkylineWindowMats(), registerWindowMat);
    registerMats(getBuildingWindowMats(), registerWetMat);
    registerMats(getSkylineWindowMats(), registerWetMat);
    registerMats(getPavedWetMats(), registerWetMat);
    const graph = buildCityGraph(layout);
    e.state.city = {
      size: layout.size,
      roads,
      spawn: { x: layout.spawn.x, z: layout.spawn.z },
      intersections: graph.intersections,
      lanes: graph.lanes,
      sidewalks: graph.sidewalks,
      pois: graph.pois,
    };
    void this._hydrate(e).catch(() => {});
  }

  async _hydrate(e) {
    const layout = this._layout;
    const assets = e.state && e.state.assets;
    try {
      const pbr = await loadFacadePBR(assets);
      applyBuildingPbr(pbr);
    } catch (_err) {
      // канвас-фасады остаются
    }
    try {
      await loadGroundPBR(assets);
      const ground = buildPbrGround(e, layout);
      if (ground && ground.usedAssets) {
        setPavedVisible(false);
        setShoreSandVisible(false);
      } else if (ground) {
        setVisible(ground.asphaltMesh, false);
        setVisible(ground.walkMesh, false);
        setVisible(ground.sandMesh, false);
        setVisible(ground.markMesh, false);
      }
      registerMats(getGroundWetMats(), registerWetMat);
    } catch (_err) {
      // roads.js / shore.js остаются
    }
    try {
      const palms = await buildKenneyPalms(e, layout);
      if (palms && palms.usedAssets) {
        setVisible(this._props && this._props.palms, false);
      } else if (palms && palms.meshes) {
        setVisible(palms.meshes, false);
      }
    } catch (_err) {
      // пальмы props.js остаются
    }
    try {
      const dress = await buildKenneyDress(e, layout);
      if (dress && dress.meshes && dress.meshes.length) {
        setVisible(this._props && this._props.lampPosts, false);
        setVisible(this._props && this._props.lampGlobes, false);
        setLampSpotsVisible(false);
      }
    } catch (_err) {
      // фонари props.js остаются
    }
  }

  update(dt, e) {
    updateCityGraph(dt, e);
    updateBuildings(dt, e);
    updateSkyline(dt, e);
    updateShore(dt, e);
    updateProps(dt, e);
    updateStreetDress(dt, e);
    updateBeachLife(dt, e);
    updateHotelSigns(dt, e);
    updatePbrFacades(dt, e);
    updatePbrGround(dt, e);
    updateKenneyPalms(dt, e);
    updateKenneyDress(dt, e);
    updateNeonSigns(dt, e);
    updateLampSpots(dt, e);
    updatePuddles(dt, e);
    updateWetSurfaces(dt, e);
    updateWindowNight(dt, e);
  }
}
