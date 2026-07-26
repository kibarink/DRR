// Appendix: MongoDB (2dsphere) x KG Integration Example (Nodes + Edges)

// 1. Node collection: SlopeUnit, Valley, House, HazardArea
// Each node has a GeoJSON geometry for 2dsphere spatial queries.

db.nodes.insertMany([
  {
    _id: "slope_001",
    type: "SlopeUnit",
    location: {
      type: "Polygon",
      coordinates: [ /* ... */ ]
    },
    properties: {
      slope_angle: 32,
      curvature: -0.15,
      elevation: 450
    }
  },
  {
    _id: "valley_01",
    type: "Valley",
    location: {
      type: "LineString",
      coordinates: [ /* ... */ ]
    }
  },
  {
    _id: "house_100",
    type: "House",
    location: {
      type: "Point",
      coordinates: [139.65, 35.72]
    }
  },
  {
    _id: "hazard_05",
    type: "HazardArea",
    location: {
      type: "Polygon",
      coordinates: [ /* ... */ ]
    },
    hazard_type: "Landslide"
  }
]);

// 2. Edge collection: KG relations between nodes

db.edges.insertMany([
  {
    _id: "edge_001",
    from: "slope_001",
    to: "valley_01",
    relation: "drains_into"
  },
  {
    _id: "edge_002",
    from: "slope_001",
    to: "house_100",
    relation: "threatens"
  },
  {
    _id: "edge_003",
    from: "hazard_05",
    to: "house_100",
    relation: "overlaps"
  }
]);

// 3. 2dsphere index on node geometries

db.nodes.createIndex({ location: "2dsphere" });

// 4. Example: find Houses threatened by a given SlopeUnit,
//    combining KG relation (threatens) and spatial proximity (within 100m)

db.edges.aggregate([
  {
    $match: {
      from: "slope_001",
      relation: "threatens"
    }
  },
  {
    $lookup: {
      from: "nodes",
      localField: "to",
      foreignField: "_id",
      as: "house_nodes"
    }
  },
  { $unwind: "$house_nodes" },
  {
    $match: {
      "house_nodes.type": "House",
      "house_nodes.location": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [139.65, 35.72] // representative point of slope_001
          },
          $maxDistance: 100
        }
      }
    }
  }
]);

// 5. Example: from a SlopeUnit, traverse downstream via KG (edges)
//    and find HazardAreas that spatially intersect those downstream nodes.

db.edges.aggregate([
  { $match: { from: "slope_001" } },
  {
    $graphLookup: {
      from: "edges",
      startWith: "$to",
      connectFromField: "to",
      connectToField: "from",
      as: "downstream"
    }
  },
  { $unwind: "$downstream" },
  {
    $lookup: {
      from: "nodes",
      localField: "downstream.to",
      foreignField: "_id",
      as: "downstream_nodes"
    }
  },
  { $unwind: "$downstream_nodes" },
  {
    $lookup: {
      from: "nodes",
      let: { geom: "$downstream_nodes.location" },
      pipeline: [
        {
          $match: {
            type: "HazardArea",
            $expr: {
              $geoIntersects: {
                $geometry: "$$geom"
              }
            }
          }
        }
      ],
      as: "intersecting_hazards"
    }
  }
]);