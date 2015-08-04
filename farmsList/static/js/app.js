var app = angular.module('listApp', ['angular-mapbox','leaflet-directive'])
.config(function($interpolateProvider) {
    $interpolateProvider.startSymbol('{[');
    $interpolateProvider.endSymbol(']}');
  })

.run(function(mapboxService) {
    mapboxService.init({ accessToken: 'pk.eyJ1IjoiY29kZWZvcmFtZXJpY2EiLCJhIjoiSTZlTTZTcyJ9.3aSlHLNzvsTwK-CYfZsG_Q' });
  })

.factory('parcelStyles', function() {
    var parcelStyles = {
      base: {
        fillColor: "lawngreen",
        weight: 2,
        color: 'white',
        dashArray: '3'
      }
    };
    parcelStyles.unselected = angular.copy(parcelStyles.base);
    parcelStyles.unselected.fillOpacity = 0.2;
    parcelStyles.unselected.opacity = 0.7;
    parcelStyles.unselected.fillColor = 'green';
    parcelStyles.selected = angular.copy(parcelStyles.base);
    parcelStyles.selected.fillOpacity = 0.45;
    parcelStyles.selected.opacity = 1;
    delete parcelStyles.base;
    return parcelStyles;
  });

app.controller('MainController', function($scope, $http, mapboxService, parcelStyles){
  var getFarm = function(farmId) {
        var _farm;
        angular.forEach($scope.farms, function(farm) {
          if (!_farm && farm.id === farmId) {
            _farm = farm;
          }
        });
        return _farm;
      },
      zoomPanTo = function(farmId) {
        var map = mapboxService.getMapInstances()[0],
            farm = getFarm(farmId);
        map.setView(L.latLng(farm.center.lat, farm.center.lng), 17, {
          pan: {
            animate: true,
            duration: .5
          },
          zoom: {
            animate: true
          }
        });
      },
      unselectedParcelStyle = parcelStyles.unselected,
      selectedParcelStyle = parcelStyles.selected;
  $scope.goToFarmlandDetailsPage = function(farmId) {
    document.location.href = '/farmland-details/' + farmId;
  };
  $scope.gotoContactForm = function(farmId, $event) {
    document.location.href='/contact-land-owner/' + farmId;
    $event.stopPropagation();
  };
  $scope.highlightParcelOnMap = function(farmId) {
    var map = mapboxService.getMapInstances()[0],
        farm = getFarm(farmId);
    map.eachLayer(function (layer) {
      if (layer.getLatLng !== undefined) {
        var latLng = layer.getLatLng();
        if (latLng.lat == farm.center.lat && latLng.lng == farm.center.lng) {
          layer.setOpacity(1);
        } else {
          layer.setOpacity(.5);
        }
      } else if (layer.feature !== undefined) {
        map.removeLayer(layer);
        if (angular.equals(layer.feature, farm.geometry)) {
          layer.setStyle(selectedParcelStyle);
        } else {
          layer.setStyle(unselectedParcelStyle);
        }
        map.addLayer(layer);
      }
    });
  };
  $http.get('/api/parcel/').
    success(function(data, status, headers, config) {
      if (!data || data.length === 0) {
        return;
      }
      $scope.farms = [];
      angular.forEach(data, function(parcel) {
        var center = parcel.center.geometry.coordinates;
        parcel.center.lat = center[1];
        parcel.center.lng = center[0];
        // This conversion is needed because the jsonpickle
        // serialization seems forced to maintain type references
        parcel.water = parcel.water + ' gallons per minute'
        $scope.farms.push(parcel);
      });
    }).
    error(function(data, status, headers, config) {
      console.log('error getting parcel data from server');
    });
})

.controller('PublishListingsController', ['$scope', '$http', 'leafletData', 'parcelStyles', function($scope, $http, leafletData, parcelStyles){
  leafletData.getMap('list-parcels-map').then(function(map) {
    map.scrollWheelZoom.disable();
    var featureGroup = L.featureGroup().addTo(map),
        drawControl = new L.Control.Draw({
      draw: {
        circle: false,
        rectangle: false,
        marker: false,
        polyline: false
      },
      edit: {
        featureGroup: featureGroup
      }
    }).addTo(map);
    map.on('draw:created', function(e) {
      featureGroup.addLayer(e.layer);
      var geoJSON = featureGroup.toGeoJSON();
      document.getElementById('newParcelGeometry').value = JSON.stringify(geoJSON);
      document.getElementById('newParcelSize').value = turf.area(geoJSON) / 4046.85642;
      document.getElementById('newParcelCenter').value = JSON.stringify(turf.centroid(geoJSON));
      document.getElementById('apn').value = 0;
    });
  });

  window.showTaxIncentiveZoneTooltip = function(event) {
    var html = "<p>Land being used for farming in this area entitles the property owner to a tax write-off in accordance with <a href=\"http://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=201320140AB551\" target=\"_blank\">AB551</a>.</p>";
    var mouseEnteredTooltip = false;
    if ($('#AB551-tooltip')[0] === undefined) {
      var hideTaxIncentiveZoneTooltip = function(event) {
        setTimeout(function() {
          if (!mouseEnteredTooltip || event.target === tooltipElement) {
            mouseEnteredTooltip = false;
            tooltipElement.style.display = 'none';
          }
        }, 10);
      },
      tooltipElement = document.createElement('div');
      tooltipElement.id = 'AB551-tooltip';
      tooltipElement.innerHTML = html;
      tooltipElement.style.display = 'none';
      tooltipElement.style.position = 'absolute';
      tooltipElement.style.fontSize = '10px';
      tooltipElement.style.width = '100px';
      tooltipElement.style.backgroundColor = 'white';
      tooltipElement.style.zIndex = '9999';
      tooltipElement.style.borderStyle = 'solid';
      tooltipElement.style.borderRadius = '5px';
      tooltipElement.style.padding = '5px';
      var leafletKeyElement = $('.leaflet-control-layers.leaflet-control-layers-expanded.leaflet-control')[0];
      leafletKeyElement.addEventListener('mouseleave', hideTaxIncentiveZoneTooltip);
      tooltipElement.addEventListener('mouseleave', hideTaxIncentiveZoneTooltip);
      tooltipElement.addEventListener('mouseenter', function() {
        mouseEnteredTooltip = true;
      });
      document.body.appendChild(tooltipElement);
    } else {
      var tooltipElement = $('#AB551-tooltip')[0];
    }
    tooltipElement.style.top = event.y - $('#AB551-tooltip').height() + 'px';
    tooltipElement.style.left = event.x - 50 + 'px';
    tooltipElement.style.display = 'block';
  };

  $http.get('/api/tax-incentive-zones').
    success(function(data, status, headers, config) {
      if (!data || data.length === 0) {
        return;
      }
      var taxIncentiveZones = {
        type: "Feature",
        geometry: JSON.parse(data.geometry),
        properties: {
          name: data.name
        }
      };
      data = {
        type: "FeatureCollection",
        features: [taxIncentiveZones]
      };
      var style = parcelStyles.unselected;
      style.clickable = false;
      var taxIncentiveZonesLayer = L.geoJson(data, {
        style: style
      });
      leafletData.getMap('list-parcels-map').then(function(map) {
        var overlays = {
          "<span class=\"text-green\">Urban Agriculture Tax Incentive Zones</span> <span class=\"fa fa-info-circle\" onmouseover=\"showTaxIncentiveZoneTooltip(event)\"></span>": taxIncentiveZonesLayer
        };
        var overlayControl = L.control.layers({}, overlays, {collapsed: false, position: "bottomright"}).addTo(map);
        map.addLayer(taxIncentiveZonesLayer);
      });
    }).
    error(function(data, status, headers, config) {
      console.log('error getting parcel data from server in PublishListingsController');
    });

  angular.extend($scope, {
    center: {
      lat: 38.585,
      lng: -121.542,
      zoom: 14
    },
    layers: {
      baselayers: {
        satellite: {
          name: 'Satellite',
          url: 'http://{s}.tiles.mapbox.com/v4/codeforamerica.m5m971km/{z}/{x}/{y}@2x.png?access_token=pk.eyJ1IjoiY29kZWZvcmFtZXJpY2EiLCJhIjoiSTZlTTZTcyJ9.3aSlHLNzvsTwK-CYfZsG_Q',
          type: 'xyz',
          layerOptions: {
            attribution: 'Mapbox | OpenStreetMap',
          }
        },
        street: {
          name: 'Street',
          url: 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          type: 'xyz',
          layerOptions: {
            attribution: 'Mapbox | OpenStreetMap',
          }
        }
      }
    }
  });
}])

.controller('FarmlandDetailsController', function($scope, $http, leafletData, $location, parcelStyles){
  $scope.farmland = {};
  $http.get('/api/farmland/' + $location.absUrl().split('farmland-details/')[1]).
    success(function(data, status, headers, config) {
      if (!data || data.length === 0) {
        return;
      }
      var center = data.center['geometry']['coordinates'];
      $scope.center = {
        lat: center[1],
        lng: center[0],
        zoom: 16
      };
      angular.extend($scope, {
        farmland: data,
        geojson: {
          data: JSON.parse(data['geometry']),
          style: parcelStyles.selected
        }
      });
    }).
    error(function(data, status, headers, config) {
      console.log('error getting farmland data from server in FarmlandDetailsController');
    });
  angular.extend($scope, {
    center: {
      lat: 38.58024,
      lng: -121.5305,
      zoom: 14
    },
    layers: {
      baselayers: {
        xyz: {
          name: 'OpenStreetMap (XYZ)',
          url: 'http://{s}.tiles.mapbox.com/v4/codeforamerica.m5m971km/{z}/{x}/{y}@2x.png?access_token=pk.eyJ1IjoiY29kZWZvcmFtZXJpY2EiLCJhIjoiSTZlTTZTcyJ9.3aSlHLNzvsTwK-CYfZsG_Q',
          type: 'xyz',
          layerOptions: {
            attribution: 'Mapbox | OpenStreetMap',
            showOnSelector: false
          }
        }
      }
    }
  });
});
