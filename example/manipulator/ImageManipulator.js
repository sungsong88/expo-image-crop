import React, { Component } from 'react'
import {
    Dimensions,
    Image,
    ScrollView,
    Modal,
    View,
    Text,
    SafeAreaView,
    TouchableOpacity,
    YellowBox,
} from 'react-native'
import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system'
import PropTypes from 'prop-types'
import AutoHeightImage from 'react-native-auto-height-image'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'
import MaterialIcon from 'react-native-vector-icons/MaterialIcons'
import { isIphoneX } from 'react-native-iphone-x-helper'
import ImageCropOverlay from './ImageCropOverlay'

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;
const toolbarHeight = 64;
const viewFinderWidth = windowWidth;
const viewFinderHeight = windowHeight - toolbarHeight - (isIphoneX() ? 44 : 0);
const viewFinderRatio = viewFinderHeight / viewFinderWidth;

YellowBox.ignoreWarnings(['componentWillReceiveProps', 'componentWillUpdate', 'componentWillMount'])
YellowBox.ignoreWarnings([
    'Warning: componentWillMount is deprecated',
    'Warning: componentWillReceiveProps is deprecated',
    'Module RCTImageLoader requires',
])

class ExpoImageManipulator extends Component {
    constructor(props) {
        super(props)
        this.state = {
            cropMode: false,
            processing: false,
            viewerOffsetY: 0,
            fixedRatioFirstCropIsRun: false,
            fixedRatioEditingFinished: false,
            zoomScale: 1,
        }

        this.scrollOffset = 0

        this.currentPos = {
            left: 0,
            top: 0,
        }

        this.currentSize = {
            width: 0,
            height: 0,
        }

        this.maxSizes = {
            width: 0,
            height: 0,
        }

        this.actualSize = {
            width: 0,
            height: 0,
        }
    }

    async componentDidMount() {
        await this.onConvertImageToEditableSize()
    }

    onGetCorrectSizes = (w, h) => {
        const sizes = {
            convertedWidth: w,
            convertedheight: h,
        }
        const ratio = Math.min(1920 / w, 1080 / h)
        sizes.convertedWidth = Math.round(w * ratio)
        sizes.convertedheight = Math.round(h * ratio)
        return sizes
    }

    async onConvertImageToEditableSize() {
        const { photo: { uri: rawUri } } = this.props
        Image.getSize(rawUri, async (imgW, imgH) => {
            const { convertedWidth, convertedheight } = this.onGetCorrectSizes(imgW, imgH)
            const { uri, width: w, height } = await ImageManipulator.manipulateAsync(rawUri,
                [
                    {
                        resize: {
                            width: convertedWidth,
                            height: convertedheight,
                        },
                    },
                ])
            this.setState({
                uri,
            })
            this.actualSize.width = w
            this.actualSize.height = height
        })
    }

    get isRemote() {
        const { uri } = this.state
        return /^(http|https|ftp)?(?:[:/]*)([a-z0-9.-]*)(?::([0-9]+))?(\/[^?#]*)?(?:\?([^#]*))?(?:#(.*))?$/.test(uri)
    }

    onToggleModal = () => {
        const { onToggleModal } = this.props
        onToggleModal()
        this.setState({ cropMode: false })
    }

    onCropImage = () => {
        this.setState({ processing: true })
        const { uri } = this.state
        Image.getSize(uri, async (actualWidth, actualHeight) => {
            const cropObj = this.getCropBounds(actualWidth, actualHeight)
            if (cropObj.height > 0 && cropObj.width > 0) {
                let uriToCrop = uri
                if (this.isRemote) {
                    const response = await FileSystem.downloadAsync(
                        uri,
                        FileSystem.documentDirectory + 'image',
                    )
                    uriToCrop = response.uri
                }
                const {
                    uri: uriCroped, base64, width: croppedWidth, height: croppedHeight,
                } = await this.crop(cropObj, uriToCrop)

                this.actualSize.width = croppedWidth
                this.actualSize.height = croppedHeight

                this.setState({
                    uri: uriCroped, base64, cropMode: false, processing: false,
                })
            } else {
                this.setState({ cropMode: false, processing: false })
            }
        })
    }

    onRotateImage = async () => {
        const { uri } = this.state
        let uriToCrop = uri
        if (this.isRemote) {
            const response = await FileSystem.downloadAsync(
                uri,
                FileSystem.documentDirectory + 'image',
            )
            uriToCrop = response.uri
        }
        Image.getSize(uri, async (width2, height2) => {
            const { uri: rotUri, base64 } = await this.rotate(uriToCrop, width2, height2)
            this.setState({ uri: rotUri, base64 })
        })
    }

    onFlipImage = async (orientation) => {
        const { uri } = this.state
        let uriToCrop = uri
        if (this.isRemote) {
            const response = await FileSystem.downloadAsync(
                uri,
                FileSystem.documentDirectory + 'image',
            )
            uriToCrop = response.uri
        }
        Image.getSize(uri, async () => {
            const { uri: rotUri, base64 } = await this.filp(uriToCrop, orientation)
            this.setState({ uri: rotUri, base64 })
        })
    }

    onHandleScroll = (event) => {
        this.scrollOffset = event.nativeEvent.contentOffset.y
    }

    getCropBounds = (actualWidth, actualHeight) => {
        const imageRatio = actualHeight / actualWidth
        const renderedImageWidth = imageRatio < (viewFinderHeight / windowWidth) ? windowWidth : viewFinderHeight / imageRatio
        const renderedImageHeight = imageRatio < (viewFinderHeight / windowWidth) ? windowWidth * imageRatio : viewFinderHeight

        const renderedImageY = (viewFinderHeight - renderedImageHeight) / 2.0
        const renderedImageX = (windowWidth - renderedImageWidth) / 2.0

        const renderImageObj = {
            left: renderedImageX,
            top: renderedImageY,
            width: renderedImageWidth,
            height: renderedImageHeight,
        }
        const cropOverlayObj = {
            left: this.currentPos.left,
            top: this.currentPos.top,
            width: this.currentSize.width,
            height: this.currentSize.height,
        }

        let intersectAreaObj = {}

        const x = Math.max(renderImageObj.left, cropOverlayObj.left)
        const num1 = Math.min(renderImageObj.left + renderImageObj.width, cropOverlayObj.left + cropOverlayObj.width)
        const y = Math.max(renderImageObj.top, cropOverlayObj.top)
        const num2 = Math.min(renderImageObj.top + renderImageObj.height, cropOverlayObj.top + cropOverlayObj.height)
        if (num1 >= x && num2 >= y) {
            intersectAreaObj = {
                originX: (x - renderedImageX) * (actualWidth / renderedImageWidth),
                originY: (y - renderedImageY) * (actualWidth / renderedImageWidth),
                width: (num1 - x) * (actualWidth / renderedImageWidth),
                height: (num2 - y) * (actualWidth / renderedImageWidth),
            }
        } else {
            intersectAreaObj = {
                originX: x - renderedImageX,
                originY: y - renderedImageY,
                width: 0,
                height: 0,
            }
        }
        return intersectAreaObj
    }

    filp = async (uri, orientation) => {
        const { saveOptions } = this.props
        const manipResult = await ImageManipulator.manipulateAsync(uri, [{
            flip: orientation === 'vertical' ? ImageManipulator.FlipType.Vertical : ImageManipulator.FlipType.Horizontal,
        }],
        saveOptions)
        return manipResult
    };

    rotate = async (uri, width2) => {
        const { saveOptions } = this.props
        const manipResult = await ImageManipulator.manipulateAsync(uri, [{
            rotate: -90,
        }, {
            resize: {
                width: this.trueWidth || width2,
                // height: this.trueHeight || height2,
            },
        }], saveOptions)
        return manipResult
    }

    crop = async (cropObj, uri) => {
        const { saveOptions } = this.props
        if (cropObj.height > 0 && cropObj.width > 0) {
            const manipResult = await ImageManipulator.manipulateAsync(
                uri,
                [{
                    crop: cropObj,
                }],
                saveOptions,
            )
            return manipResult
        }
        return {
            uri: null,
            base64: null,
        }
    };

    // calculateMaxSizes = (event) => {
    //     const { fixedSquareAspect } = this.state
    //     let w1 = event.nativeEvent.layout.width || 100
    //     let h1 = event.nativeEvent.layout.height || 100
    //     if (fixedSquareAspect) {
    //         if (w1 < h1) h1 = w1
    //         else w1 = h1
    //     }
    //     this.maxSizes.width = w1
    //     this.maxSizes.height = h1
    // };

    // eslint-disable-next-line camelcase
    async UNSAFE_componentWillReceiveProps() {
        await this.onConvertImageToEditableSize()
    }

    zoomImage() {
        // this.refs.imageScrollView.zoomScale = 5
        // this.setState({width: width})
        // this.setState({zoomScale: 5})

        // this.setState(curHeight)
    }

    render() {
        const {
            isVisible,
            onPictureChoosed,
            borderColor,
            allowRotate = true,
            allowFlip = true,
            btnTexts,
            fixedMask,
            fixedRatio
        } = this.props
        const {
            uri,
            base64,
            cropMode,
            processing,
            viewerOffsetY,
            fixedRatioFirstCropIsRun,
            fixedRatioEditingFinished
        } = this.state

        const imageRatio = this.actualSize.height / this.actualSize.width;
        const fixedCalculatedRatio = fixedRatio ? (fixedRatio.split(":")[1] / fixedRatio.split(":")[0]) : null;
        const cropRatio = fixedCalculatedRatio ? fixedCalculatedRatio : imageRatio;

        let cropWidth;
        let cropHeight;
        let imageWidth;
        let imageHeight;
        let cropInitialTop;
        let cropInitialLeft;
        let minWidth = 100;
        let minHeight = 100;

        // Narrow picture
        if(viewFinderRatio < imageRatio) {
            imageWidth = viewFinderHeight / imageRatio;
            imageHeight = viewFinderHeight;
        }
        // Wide picture
        else {
            imageWidth = viewFinderWidth;
            imageHeight = viewFinderWidth * imageRatio;
        }

        if(fixedCalculatedRatio) {
            let retrievedWidth = imageWidth;
            let retreivedHeight = imageWidth * fixedCalculatedRatio;
            if(retreivedHeight > imageHeight) {
                retrievedWidth = imageHeight / fixedCalculatedRatio;
                retreivedHeight = imageHeight;
            }

            cropWidth = retrievedWidth;
            cropHeight = retreivedHeight;
            cropInitialLeft = (viewFinderWidth - retrievedWidth) / 2;
            cropInitialTop = (viewFinderHeight - retreivedHeight) / 2;

            let retrievedMinWidth = minWidth;
            let retrievedMinHeight = minWidth * fixedCalculatedRatio;
            if(retrievedMinHeight < minHeight) {
                retrievedMinWidth = minHeight / fixedCalculatedRatio;
                retrievedMinHeight = minHeight;
            }
            minWidth = retrievedMinWidth;
            minHeight = retrievedMinHeight;
        }
        else {
            cropWidth = imageWidth;
            cropHeight = imageHeight;
            cropInitialLeft = (viewFinderWidth - imageWidth) / 2
            cropInitialTop = (viewFinderHeight - imageHeight) / 2
        }

        if (this.currentSize.width === 0 && cropMode) {
            this.currentSize.width = cropWidth
            this.currentSize.height = cropHeight

            this.currentPos.top = cropInitialTop
            this.currentPos.left = cropInitialLeft
        }

        return (
            <Modal
                animationType="slide"
                transparent
                visible={isVisible}
                hardwareAccelerated
                onRequestClose={() => {
                    this.onToggleModal()
                }}
            >
                <SafeAreaView
                    style={{
                        width: windowWidth, flexDirection: 'row', backgroundColor: 'black', justifyContent: 'space-between',
                    }}
                >
                    <ScrollView scrollEnabled={false}
                        horizontal
                        contentContainerStyle={{
                            width: '100%', paddingHorizontal: 15, height: toolbarHeight, alignItems: 'center',
                        }}
                    >
                        {!cropMode || fixedRatio
                            ? (
                                <View style={{ flexDirection: 'row' }}>
                                    <TouchableOpacity onPress={() => this.onToggleModal()}
                                        style={{
                                            width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        <Icon size={24} name="arrow-left" color="white" />
                                    </TouchableOpacity>
                                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
                                        {
                                            !fixedRatio
                                            && (
                                                <TouchableOpacity onPress={() => this.setState({ cropMode: true })}
                                                    style={{
                                                        marginLeft: 10, width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
                                                    }}
                                                >
                                                    <Icon size={20} name="crop" color="white" />
                                                </TouchableOpacity>
                                            )
                                        }
                                        {
                                            allowRotate
                                            && (
                                                <View style={{ flexDirection: 'row' }}>

                                                    <TouchableOpacity onPress={() => this.onRotateImage()}
                                                        style={{
                                                            marginLeft: 10, width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
                                                        }}
                                                    >
                                                        <Icon size={20} name="rotate-left" color="white" />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => this.onFlipImage('vertical')}
                                                        style={{
                                                            marginLeft: 10, width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
                                                        }}
                                                    >
                                                        <MaterialIcon style={{ transform: [{ rotate: '270deg' }] }} size={20} name="flip" color="white" />
                                                    </TouchableOpacity>
                                                </View>
                                            )
                                        }
                                        {
                                            allowFlip
                                            && (
                                                <View style={{ flexDirection: 'row' }}>

                                                    <TouchableOpacity onPress={() => this.onFlipImage('horizontal')}
                                                        style={{
                                                            marginLeft: 10, width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
                                                        }}
                                                    >
                                                        <MaterialIcon size={20} name="flip" color="white" />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => { 
                                                        if(fixedRatio) {
                                                            this.setState({ fixedRatioEditingFinished: true });
                                                            this.onCropImage();
                                                        }
                                                        else {
                                                            onPictureChoosed({ uri, base64 }); 
                                                            this.onToggleModal() 
                                                        }
                                                    }}
                                                        style={{
                                                            marginLeft: 10, width: 60, height: 32, alignItems: 'center', justifyContent: 'center',
                                                        }}
                                                    >
                                                        <Text style={{ fontWeight: '500', color: 'white', fontSize: 18 }}>{btnTexts.done}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )
                                        }
                                    </View>
                                </View>
                            )
                            : (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <TouchableOpacity onPress={() => this.setState({ cropMode: false })}
                                        style={{
                                            width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        <Icon size={24} name="arrow-left" color="white" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => this.onCropImage()}
                                        style={{
                                            marginRight: 10, alignItems: 'flex-end', flex: 1,
                                        }}
                                    >
                                        <View style={{ flexDirection: 'row' }}>
                                            <MaterialIcon style={{ flexDirection: 'row', marginRight: 10 }} size={24} name={!processing ? 'done' : 'access-time'} color="white" />
                                            <Text style={{ fontWeight: '500', color: 'white', fontSize: 18 }}>{!processing ? btnTexts.crop : btnTexts.processing}</Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            )
                        }
                    </ScrollView>
                </SafeAreaView>
                <View style={{ flex: 1, backgroundColor: 'black', width: windowWidth }} onLayout={({ nativeEvent }) => this.setState({ viewerOffsetY: nativeEvent.layout.y})}>
                    <ScrollView
                        style={{ position: 'relative', flex: 1 }}
                        contentContainerStyle={{ backgroundColor: 'black' }}
                        maximumZoomScale={5}
                        minimumZoomScale={0.5}
                        onScroll={this.onHandleScroll}
                        bounces={false}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        ref={(c) => { this.scrollView = c }}
                        scrollEventThrottle={16}
                        scrollEnabled={false}
                        pinchGestureEnabled={false}
                        // scrollEnabled={cropMode ? false : true}
                        // pinchGestureEnabled={cropMode ? false : pinchGestureEnabled}
                    >
                        <AutoHeightImage
                            style={{ backgroundColor: 'black' }}
                            source={{ uri }}
                            resizeMode={imageRatio >= 1 ? 'contain' : 'contain'}
                            width={windowWidth}
                            height={viewFinderHeight}
                            onLoadEnd={
                                fixedRatio ? (
                                    !fixedRatioFirstCropIsRun ? 
                                        () => this.setState({ cropMode: true, fixedRatioFirstCropIsRun: true }) 
                                        : (
                                            fixedRatioEditingFinished ? 
                                                () => { onPictureChoosed({ uri, base64 }); this.onToggleModal() }
                                                : null
                                        )
                                    ) : null
                            }
                            // onLayout={this.calculateMaxSizes}
                        />
                        {!!cropMode && (
                            <ImageCropOverlay
                                onLayoutChanged={(top, left, w, height) => {
                                    this.currentSize.width = w
                                    this.currentSize.height = height
                                    this.currentPos.top = top
                                    this.currentPos.left = left
                                }}
                                viewerOffsetY={viewerOffsetY}
                                imageTop={(viewFinderHeight - imageHeight) / 2}
                                imageBottom={((viewFinderHeight - imageHeight) / 2) + imageHeight}
                                imageLeft={(viewFinderWidth - imageWidth) / 2}
                                imageRight={((viewFinderWidth - imageWidth) / 2) + imageWidth}
                                initialWidth={(fixedMask && fixedMask.width) || cropWidth}
                                initialHeight={(fixedMask && fixedMask.height) || cropHeight}
                                initialTop={cropInitialTop}
                                initialLeft={cropInitialLeft}
                                minHeight={(fixedMask && fixedMask.height) || minHeight}
                                minWidth={(fixedMask && fixedMask.width) || minWidth}
                                borderColor={borderColor}
                                fixedRatio={fixedRatio}
                            />
                        )
                        }
                    </ScrollView>
                </View>
            </Modal>
        )
    }
}

export default ExpoImageManipulator

ExpoImageManipulator.defaultProps = {
    onPictureChoosed: ({ uri, base64 }) => console.log('URI:', uri, base64),
    borderColor: '#a4a4a4',
    btnTexts: {
        crop: 'Crop',
        rotate: 'Rotate',
        done: 'Done',
        processing: 'Processing',
    },
    saveOptions: {
        compress: 1,
        format: ImageManipulator.SaveFormat.PNG,
        base64: false,
    },
    fixedMask: null,
    fixedRatio: null
}

ExpoImageManipulator.propTypes = {
    borderColor: PropTypes.string,
    isVisible: PropTypes.bool.isRequired,
    onPictureChoosed: PropTypes.func,
    btnTexts: PropTypes.object,
    fixedMask: PropTypes.object,
    fixedRatio: PropTypes.string,
    saveOptions: PropTypes.object,
    photo: PropTypes.object.isRequired,
    onToggleModal: PropTypes.func.isRequired,
}
