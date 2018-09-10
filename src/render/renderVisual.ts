module powerbi.extensibility.visual {
    import svg = powerbi.extensibility.utils.svg;
    import CssConstants = svg.CssConstants;
    import IInteractiveBehavior = powerbi.extensibility.utils.interactivity.IInteractiveBehavior;
    import IInteractivityService = powerbi.extensibility.utils.interactivity.IInteractivityService;
    import TooltipEventArgs = powerbi.extensibility.utils.tooltip.TooltipEventArgs;
    import ITooltipServiceWrapper = powerbi.extensibility.utils.tooltip.ITooltipServiceWrapper;
    import UpdateSelection = d3.selection.Update;
    import dataLabelUtils = powerbi.extensibility.utils.chart.dataLabel.utils;
    import PixelConverter = powerbi.extensibility.utils.type.PixelConverter;
    import ValueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import IValueFormatter = powerbi.extensibility.utils.formatting.IValueFormatter;
    import translate = powerbi.extensibility.utils.svg.translate;
    import ClassAndSelector = powerbi.extensibility.utils.svg.CssConstants.ClassAndSelector;
    import createClassAndSelector = powerbi.extensibility.utils.svg.CssConstants.createClassAndSelector;

    module Selectors {
        export const BarSelect = CssConstants.createClassAndSelector("bar");
        export const BarGroupSelect = CssConstants.createClassAndSelector("bar-group");
    }

    export class RenderVisual {
        private static Label: ClassAndSelector = createClassAndSelector("label");
        private static dataLabelMargin: number = 8;

        public static render(
            data: VisualData,
            settings: VisualSettings,
            visualSvgGroup: d3.Selection<SVGElement>,
            clearCatcher: d3.Selection<any>,
            visualInteractivityService: IInteractivityService,
            visualBehavior: IInteractiveBehavior,
            tooltipServiceWrapper: ITooltipServiceWrapper,
            hasHighlight: boolean) {
            // Select all bar groups in our chart and bind them to our categories.
            // Each group will contain a set of bars, one for each of the values in category.
            const barGroupSelect = visualSvgGroup.selectAll(Selectors.BarGroupSelect.selectorName)
                .data([data.dataPoints]);

            // When a new category added, create a new SVG group for it.
            barGroupSelect.enter()
                .append("g")
                .attr("class", Selectors.BarGroupSelect.className);

            // For removed categories, remove the SVG group.
            barGroupSelect.exit()
                .remove();

            // Update the position of existing SVG groups.
            // barGroupSelect.attr("transform", d => `translate(0, ${data.axes.y(d.category)})`);

            // Now we bind each SVG group to the values in corresponding category.
            // To keep the length of the values array, we transform each value into object,
            // that contains both value and total count of all values in this category.
            const barSelect = barGroupSelect
                .selectAll(Selectors.BarSelect.selectorName)
                .data(data.dataPoints);

            // For each new value, we create a new rectange.
            barSelect.enter().append("rect")
                .attr("class", Selectors.BarSelect.className);

            // Remove rectangles, that no longer have matching values.
            barSelect.exit()
                .remove();

            // TODO: integrate with scroll
            let categoryWidth: number = settings.categoryAxis.minCategoryWidth;
            let innerPadding: number = settings.categoryAxis.innerPadding;

            let isCategoricalAxisType: boolean = settings.categoryAxis.axisType === "categorical";
            // Set the size and position of existing rectangles.
            barSelect
                .attr({
                    height: d => {
                        return d.barCoordinates.height;
                    },
                    width: d => {
                        return d.barCoordinates.width;
                    },
                    x: d => {
                        return d.barCoordinates.x;
                    },
                    y: d => {
                        return d.barCoordinates.y;
                    },
                    fill: d => d.color
                });

            let interactivityService = visualInteractivityService,
                hasSelection: boolean = interactivityService.hasSelection();

            barSelect.style({
                "fill-opacity": (p: VisualDataPoint) => visualUtils.getFillOpacity(
                    p.selected,
                    p.highlight,
                    !p.highlight && hasSelection,
                    !p.selected && data.hasHighlight),
                "stroke": (p: VisualDataPoint)  => {
                    if ((hasHighlight || hasSelection) && visualUtils.isSelected(p.selected,
                        p.highlight,
                        !p.highlight && hasSelection,
                        !p.selected && hasHighlight)) {
                            return Visual.DefaultStrokeSelectionColor;
                        }                        

                    return p.color;
                },
                "stroke-width": p => {
                    if ((hasHighlight || hasSelection) && visualUtils.isSelected(p.selected,
                        p.highlight,
                        !p.highlight && hasSelection,
                        !p.selected && hasHighlight)) {
                        return Visual.DefaultStrokeSelectionWidth;
                    }

                    return Visual.DefaultStrokeWidth;
                }
            });

            if (interactivityService) {
                interactivityService.applySelectionStateToData(data.dataPoints);

                let behaviorOptions: WebBehaviorOptions = {
                    bars: barSelect,
                    clearCatcher: clearCatcher,
                    interactivityService: visualInteractivityService,
                };

                interactivityService.bind(data.dataPoints, visualBehavior, behaviorOptions);
            }

            this.renderTooltip(barSelect, tooltipServiceWrapper);
        }

        public static renderDataLabelsBackground(
            data: VisualData,
            settings: VisualSettings,
            dataLabelsBackgroundContext: d3.Selection<any>): void {

            let labelSettings: categoryLabelsSettings = settings.categoryLabels;

            dataLabelsBackgroundContext.selectAll("*").remove();

            if (!labelSettings.showBackground) {
                return;
            }

            let dataPointsArray: VisualDataPoint[] = this.filterData(data.dataPoints, settings.categoryLabels),
                backgroundSelection: UpdateSelection<VisualDataPoint> = dataLabelsBackgroundContext
                        .selectAll(RenderVisual.Label.selectorName)
                        .data(dataPointsArray);

            backgroundSelection
                .enter()
                .append("svg:rect");

            backgroundSelection
                .attr({
                    height: d => {
                        return d.labelCoordinates.height + DataLabelHelper.labelBackgroundHeightPadding;
                    },
                    width: d => {
                        return d.labelCoordinates.width + DataLabelHelper.labelBackgroundWidthPadding;
                    },
                    x: d => {
                        return d.labelCoordinates.x - DataLabelHelper.labelBackgroundXShift;
                    },
                    y: d => {
                        return d.labelCoordinates.y - d.labelCoordinates.height - DataLabelHelper.labelBackgroundYShift;
                    },
                    rx: 4,
                    ry: 4,
                    fill: settings.categoryLabels.backgroundColor
                });

            backgroundSelection.style({
                "fill-opacity": (100 - settings.categoryLabels.transparency) / 100,
                "pointer-events": "none"
            });

            backgroundSelection
                .exit()
                .remove();
        }

        public static renderDataLabels(
            data: VisualData,
            settings: VisualSettings,
            dataLabelsContext: d3.Selection<any>,
            metadata: VisualMeasureMetadata): void {

            let labelSettings: categoryLabelsSettings = settings.categoryLabels;

            dataLabelsContext.selectAll("*").remove();

            if (!labelSettings.show) {
                return;
            }

            let dataPointsArray: VisualDataPoint[] = this.filterData(data.dataPoints, settings.categoryLabels),
                labelSelection: UpdateSelection<VisualDataPoint> = dataLabelsContext
                        .selectAll(RenderVisual.Label.selectorName)
                        .data(dataPointsArray);

            let dataLabelFormatter: IValueFormatter =
                    formattingUtils.createFormatter(labelSettings.displayUnits,
                                                    labelSettings.precision,
                                                    metadata.cols.value,
                                                    formattingUtils.getValueForFormatter(data));

            labelSelection
                .enter()
                .append("svg:text");

            let fontSizeInPx: string = PixelConverter.fromPoint(labelSettings.fontSize);
            let fontFamily: string = labelSettings.fontFamily ? labelSettings.fontFamily : dataLabelUtils.LabelTextProperties.fontFamily;

            labelSelection
                .attr("transform", (p: VisualDataPoint) => {
                    return translate(p.labelCoordinates.x, p.labelCoordinates.y);
                });

            labelSelection
                .style({
                    "fill": labelSettings.color,
                    "font-size": fontSizeInPx,
                    "font-family": fontFamily,
                    "pointer-events": "none"
                })
                .text((p: VisualDataPoint) => dataLabelFormatter.format(p.value));

            labelSelection
                .exit()
                .remove();
        }

        private static filterData(dataPoints: VisualDataPoint[], settings: categoryLabelsSettings): VisualDataPoint[] {
            let filteredDatapoints: VisualDataPoint[] = dataPoints.filter(x => x.labelCoordinates);

            let validCoordinatesDataPoints: VisualDataPoint[] = dataPoints.filter(x => x.labelCoordinates);

            for (let index in validCoordinatesDataPoints) {
                let dataPoint = validCoordinatesDataPoints[index];
                let coords: Coordinates = dataPoint.labelCoordinates;
                let isIntersected: boolean = false;

                for (let i in filteredDatapoints) {
                    let filteredDatapoint: VisualDataPoint = filteredDatapoints[i];
                    let filteredCoods: Coordinates = filteredDatapoint.labelCoordinates;

                    if (coords.x < filteredCoods.x + filteredCoods.width + 8
                        && coords.x + coords.width > filteredCoods.x + 8
                        && coords.y < filteredCoods.y + filteredCoods.height + 2
                        && coords.y + coords.height > filteredCoods.y + 2 ) {
                        isIntersected = true;
                        break;
                    }
                }

                if (!isIntersected) {
                    filteredDatapoints.push(dataPoint);
                }
            }

            return filteredDatapoints;
        }

        private static renderTooltip(selection: d3.selection.Update<any>, tooltipServiceWrapper: ITooltipServiceWrapper): void {
            tooltipServiceWrapper.addTooltip(
                selection,
                (tooltipEvent: TooltipEventArgs<VisualDataPoint>) => {
                    return (<VisualDataPoint>tooltipEvent.data).tooltips;
                },
                null,
                true);
        }
    }
}