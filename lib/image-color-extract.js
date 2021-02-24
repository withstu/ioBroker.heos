/**
 * inspired by https://github.com/home-assistant/frontend/blob/master/src/common/image/extract_color.ts
 * LICENSE: https://github.com/home-assistant/frontend/blob/master/LICENSE.md
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const Vibrant = require('node-vibrant')

const CONTRAST_RATIO = 4.5
const COLOR_SIMILARITY_THRESHOLD = 150

//https://stackoverflow.com/a/9733420
const luminance = function(r, g, b) {
    var a = [r, g, b].map(function (v) {
        v /= 255;
        return v <= 0.03928
            ? v / 12.92
            : Math.pow( (v + 0.055) / 1.055, 2.4 );
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}
//https://stackoverflow.com/a/9733420
const rgbContrast = function(rgb1, rgb2) {
    var lum1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
    var lum2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
    var brightest = Math.max(lum1, lum2);
    var darkest = Math.min(lum1, lum2);
    return (brightest + 0.05)
        / (darkest + 0.05);
}

const extractImageColor = function(palette){
	let colorPalette = {};
	for (let color in palette) {
		if (palette.hasOwnProperty(color) && palette[color]) {
			let obj = {}
			obj.rgb = palette[color].getRgb()
			obj.hex = palette[color].getHex()
			obj.population = palette[color].getPopulation()
			obj.bodyTextColor = palette[color].getBodyTextColor()
			obj.titleTextColor = palette[color].getTitleTextColor()
			colorPalette[color] = obj
		}
	}

	let sortedPalette = Object.values(palette).sort((colorA, colorB) => colorB.population - colorA.population);
	let backgroundColor = sortedPalette[0]
	let foregroundColor;

	const contrastRatios = {};
	const approvedContrastRatio = (color) => {
		if(!contrastRatios.hasOwnProperty(color.getHex())){
			contrastRatios[color.getHex()] = rgbContrast(backgroundColor.getRgb(), color.getRgb())
		}
		return contrastRatios[color.getHex()] > CONTRAST_RATIO
	}

	for(let i = 1; i < sortedPalette.length && foregroundColor === undefined; i++){
		if(approvedContrastRatio(sortedPalette[i])){
			foregroundColor = sortedPalette[i]
			break;
		}

		let currentColor = sortedPalette[i];
		for (let j = i + 1; j < sortedPalette.length; j++){
			let compareColor = sortedPalette[j];
			const diffScore =
				Math.abs(currentColor.rgb[0] - compareColor.rgb[0]) +
				Math.abs(currentColor.rgb[1] - compareColor.rgb[1]) +
				Math.abs(currentColor.rgb[2] - compareColor.rgb[2]);
			if (diffScore > COLOR_SIMILARITY_THRESHOLD) {
				continue;
			}
			if(approvedContrastRatio(sortedPalette[i])){
				foregroundColor = sortedPalette[i]
				break;
			}
		}
	}

	return {
		colorPalette: colorPalette,
		backgroundColor: backgroundColor.getHex(),
		foregroundColor: (foregroundColor === undefined ? backgroundColor.getBodyTextColor(): foregroundColor.getHex())
	}
}


module.exports.imageColorExtract = (url, downsampleColors = 16) =>
	new Vibrant(url, {
		colorCount: downsampleColors,
	})
	.getPalette()
	.then((palette) => {
		return extractImageColor(palette);
	});